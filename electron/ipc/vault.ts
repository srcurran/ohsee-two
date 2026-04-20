import { ipcMain, safeStorage, app } from "electron";
import { promises as fs } from "fs";
import path from "path";
import { TOTP, Secret, URI } from "otpauth";

type StoredEntry = {
  label: string;
  createdAt: string;
  encryptedSecret: string;
  encryptedTotpSeed?: string;
};

type VaultFile = {
  version: 1;
  entries: Record<string, StoredEntry>;
};

type VaultEntryMeta = {
  key: string;
  label: string;
  createdAt: string;
  hasTotp: boolean;
};

type VaultEntry = VaultEntryMeta & {
  secret: string;
  totpSeed?: string;
};

const EMPTY: VaultFile = { version: 1, entries: {} };

function vaultPath(): string {
  return path.join(app.getPath("userData"), "ohsee", "vault.json");
}

async function loadVault(): Promise<VaultFile> {
  try {
    const raw = await fs.readFile(vaultPath(), "utf8");
    const parsed = JSON.parse(raw) as VaultFile;
    if (!parsed || parsed.version !== 1 || typeof parsed.entries !== "object") return { ...EMPTY };
    return parsed;
  } catch {
    return { ...EMPTY };
  }
}

async function saveVault(vault: VaultFile): Promise<void> {
  const file = vaultPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(vault, null, 2), "utf8");
}

function assertSafeStorage(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "Secure storage (Keychain) is not available on this system. Vault cannot be used.",
    );
  }
}

function encrypt(value: string): string {
  return safeStorage.encryptString(value).toString("base64");
}

function decrypt(b64: string): string {
  return safeStorage.decryptString(Buffer.from(b64, "base64"));
}

function normalizeTotpSeed(raw: string): string {
  // Accept both raw base32 and otpauth:// URIs
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().startsWith("otpauth://")) {
    const parsed = URI.parse(trimmed);
    if (parsed instanceof TOTP) return parsed.secret.base32;
    throw new Error("otpauth URI did not encode a TOTP secret");
  }
  // Validate by attempting to construct a Secret — throws on invalid base32
  Secret.fromBase32(trimmed);
  return trimmed.replace(/\s+/g, "").toUpperCase();
}

export function registerVaultHandlers(): void {
  ipcMain.handle("vault:list", async (): Promise<VaultEntryMeta[]> => {
    const vault = await loadVault();
    return Object.entries(vault.entries).map(([key, entry]) => ({
      key,
      label: entry.label,
      createdAt: entry.createdAt,
      hasTotp: !!entry.encryptedTotpSeed,
    }));
  });

  ipcMain.handle("vault:get", async (_event, key: string): Promise<VaultEntry> => {
    assertSafeStorage();
    const vault = await loadVault();
    const entry = vault.entries[key];
    if (!entry) throw new Error(`Vault entry not found: ${key}`);
    return {
      key,
      label: entry.label,
      createdAt: entry.createdAt,
      hasTotp: !!entry.encryptedTotpSeed,
      secret: decrypt(entry.encryptedSecret),
      totpSeed: entry.encryptedTotpSeed ? decrypt(entry.encryptedTotpSeed) : undefined,
    };
  });

  ipcMain.handle(
    "vault:set",
    async (_event, key: string, payload: { label: string; secret: string; totpSeed?: string }) => {
      assertSafeStorage();
      if (!key || typeof key !== "string") throw new Error("Invalid key");
      if (typeof payload?.secret !== "string") throw new Error("Invalid secret");

      const vault = await loadVault();
      const existing = vault.entries[key];
      const normalizedSeed = payload.totpSeed ? normalizeTotpSeed(payload.totpSeed) : undefined;

      vault.entries[key] = {
        label: payload.label || key,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        encryptedSecret: encrypt(payload.secret),
        ...(normalizedSeed ? { encryptedTotpSeed: encrypt(normalizedSeed) } : {}),
      };
      await saveVault(vault);
    },
  );

  ipcMain.handle("vault:delete", async (_event, key: string) => {
    const vault = await loadVault();
    delete vault.entries[key];
    await saveVault(vault);
  });

  ipcMain.handle("vault:totp", async (_event, key: string): Promise<string> => {
    assertSafeStorage();
    const vault = await loadVault();
    const entry = vault.entries[key];
    if (!entry) throw new Error(`Vault entry not found: ${key}`);
    if (!entry.encryptedTotpSeed) throw new Error(`No TOTP seed for entry: ${key}`);

    const seed = decrypt(entry.encryptedTotpSeed);
    const totp = new TOTP({ secret: Secret.fromBase32(seed), digits: 6, period: 30 });
    return totp.generate();
  });
}
