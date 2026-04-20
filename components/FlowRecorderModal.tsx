"use client";

import { useState } from "react";
import type { FlowAction } from "@/lib/types";

interface Props {
  onImport: (steps: FlowAction[]) => void;
  onClose: () => void;
}

function getRecorderSnippet(): string {
  return [
    "(function(){",
    "if(window.__ohseeRecorder){window.__ohseeRecorder.show();return}",
    "var steps=[];var recording=true;",
    "function getSelector(el){",
    "if(el.dataset&&el.dataset.testid)return'[data-testid=\"'+el.dataset.testid+'\"]';",
    "if(el.id)return'#'+CSS.escape(el.id);",
    "if(el.getAttribute('aria-label')){var tag=el.tagName.toLowerCase();return tag+'[aria-label=\"'+el.getAttribute('aria-label')+'\"]'}",
    "var tag=el.tagName.toLowerCase();",
    "if((tag==='button'||tag==='a')&&el.textContent){var text=el.textContent.trim();if(text.length>0&&text.length<60)return tag+':has-text(\"'+text+'\")'}",
    "var parts=[];var current=el;while(current&&current!==document.body&&parts.length<5){var seg=current.tagName.toLowerCase();if(current.id){parts.unshift('#'+CSS.escape(current.id));break}var parent=current.parentElement;if(parent){var siblings=Array.from(parent.children).filter(function(c){return c.tagName===current.tagName});if(siblings.length>1)seg+=':nth-of-type('+(siblings.indexOf(current)+1)+')'}parts.unshift(seg);current=parent}return parts.join(' > ')}",
    "function onClick(e){if(!recording)return;if(e.target.closest('#__ohsee-recorder'))return;steps.push({id:crypto.randomUUID(),type:'click',selector:getSelector(e.target)});updateUI()}",
    "function onInput(e){if(!recording)return;if(e.target.closest('#__ohsee-recorder'))return;var el=e.target;if(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.tagName==='SELECT'){var sel=getSelector(el);var last=steps[steps.length-1];if(last&&last.type==='fill'&&last.selector===sel){last.value=el.value}else{steps.push({id:crypto.randomUUID(),type:'fill',selector:sel,value:el.value})}updateUI()}}",
    "var bar=document.createElement('div');bar.id='__ohsee-recorder';bar.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#1a1a1a;color:#fff;border-radius:12px;padding:10px 16px;display:flex;align-items:center;gap:12px;font-family:system-ui,sans-serif;font-size:13px;box-shadow:0 8px 32px rgba(0,0,0,0.3);';",
    "var dot=document.createElement('span');dot.style.cssText='width:8px;height:8px;border-radius:50%;background:#ef4444;animation:__ohsee-pulse 1.5s infinite;';bar.appendChild(dot);",
    "var style=document.createElement('style');style.textContent='@keyframes __ohsee-pulse{0%,100%{opacity:1}50%{opacity:0.3}}';document.head.appendChild(style);",
    "var label=document.createElement('span');label.textContent='Recording... 0 steps';bar.appendChild(label);",
    "var ssBtn=document.createElement('button');ssBtn.textContent='Screenshot';ssBtn.style.cssText='background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;font-weight:bold;';ssBtn.onclick=function(){var name=prompt('Screenshot label:','Step '+(steps.filter(function(s){return s.type==='screenshot'}).length+1));if(name){steps.push({id:crypto.randomUUID(),type:'screenshot',label:name});updateUI()}};bar.appendChild(ssBtn);",
    "var undoBtn=document.createElement('button');undoBtn.textContent='Undo';undoBtn.style.cssText='background:transparent;color:#999;border:1px solid #444;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;';undoBtn.onclick=function(){steps.pop();updateUI()};bar.appendChild(undoBtn);",
    "var stopBtn=document.createElement('button');stopBtn.textContent='Stop & Copy';stopBtn.style.cssText='background:#22c55e;color:#000;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:12px;font-weight:bold;';stopBtn.onclick=function(){recording=false;document.removeEventListener('click',onClick,true);document.removeEventListener('input',onInput,true);var json=JSON.stringify(steps,null,2);navigator.clipboard.writeText(json).then(function(){label.textContent='Copied '+steps.length+' steps!';dot.style.background='#22c55e';dot.style.animation='none';setTimeout(function(){bar.remove();style.remove();delete window.__ohseeRecorder},2000)})};bar.appendChild(stopBtn);",
    "document.body.appendChild(bar);",
    "function updateUI(){label.textContent='Recording... '+steps.length+' step'+(steps.length===1?'':'s')}",
    "document.addEventListener('click',onClick,true);document.addEventListener('input',onInput,true);",
    "window.__ohseeRecorder={show:function(){bar.style.display='flex'},steps:steps}",
    "})()",
  ].join("\n");
}

export default function FlowRecorderModal({ onImport, onClose }: Props) {
  const [pastedJson, setPastedJson] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopySnippet = async () => {
    await navigator.clipboard.writeText(getRecorderSnippet());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImport = () => {
    setParseError(null);
    try {
      const parsed = JSON.parse(pastedJson);
      if (!Array.isArray(parsed)) {
        setParseError("Expected a JSON array of steps.");
        return;
      }
      const validTypes = new Set(["click", "fill", "wait", "waitForSelector", "navigate", "screenshot"]);
      const steps: FlowAction[] = parsed
        .filter((s: Record<string, unknown>) => s && typeof s.type === "string" && validTypes.has(s.type as string))
        .map((s: Record<string, unknown>) => ({
          ...s,
          id: (s.id as string) || crypto.randomUUID(),
        })) as FlowAction[];

      if (steps.length === 0) {
        setParseError("No valid steps found in the JSON.");
        return;
      }
      onImport(steps);
    } catch {
      setParseError("Invalid JSON. Make sure you copied the full output from the recorder.");
    }
  };

  return (
    <div
      className="modal"
      style={{ zIndex: 60 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal__panel modal__panel--md modal__panel--compact">
        <h3 className="modal__title">Record a Flow</h3>

        <div className="recorder-instructions" style={{ marginBottom: "var(--space-4)" }}>
          <p className="recorder-instructions__title">How it works:</p>
          <ol className="recorder-instructions__list">
            <li className="recorder-instructions__item">
              <span className="recorder-instructions__marker">1</span>
              <span>Open your target site in a new tab</span>
            </li>
            <li className="recorder-instructions__item">
              <span className="recorder-instructions__marker">2</span>
              <span>Open the browser console (F12) and paste the recorder snippet</span>
            </li>
            <li className="recorder-instructions__item">
              <span className="recorder-instructions__marker">3</span>
              <span>Click through your flow &mdash; use the <strong>Screenshot</strong> button to mark capture points</span>
            </li>
            <li className="recorder-instructions__item">
              <span className="recorder-instructions__marker">4</span>
              <span>Click <strong>Stop &amp; Copy</strong>, then paste the JSON below</span>
            </li>
          </ol>
        </div>

        <button
          onClick={handleCopySnippet}
          className="snippet-btn"
          style={{ marginBottom: "var(--space-4)" }}
        >
          {copied ? (
            <span style={{ fontWeight: "var(--weight-bold)", color: "var(--accent-green)" }}>Copied to clipboard!</span>
          ) : (
            <>
              <span style={{ fontWeight: "var(--weight-bold)", color: "var(--foreground)" }}>Copy recorder snippet</span>
              <span style={{ marginLeft: "var(--space-2)", fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>click to copy</span>
            </>
          )}
        </button>

        <textarea
          value={pastedJson}
          onChange={(e) => {
            setPastedJson(e.target.value);
            setParseError(null);
          }}
          placeholder="Paste recorded JSON here..."
          rows={6}
          className="textarea textarea--mono textarea--no-resize"
          style={{ marginBottom: "var(--space-2)" }}
        />

        {parseError && (
          <p className="error-text error-text--xs" style={{ marginBottom: "var(--space-2)" }}>{parseError}</p>
        )}

        <div className="modal__actions modal__actions--sm">
          <button onClick={onClose} className="btn btn--ghost">
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!pastedJson.trim()}
            className="btn btn--primary-sm"
          >
            Import Steps
          </button>
        </div>
      </div>
    </div>
  );
}
