import { signInWithGoogle, signInWithCredentials } from "./actions";
import { Icon } from "@/components/utility/Icon";

export default function SignInPage() {
  return (
    <div className="sign-in">
      <div className="sign-in__content">
        <div>
          <h1 className="sign-in__logo">Ohsee</h1>
          <p className="sign-in__tagline">Visual regression testing</p>
        </div>
        <form action={signInWithGoogle}>
          <button type="submit" className="sign-in__cta">
            <Icon name="google" size={20} />
            Sign in with Google
          </button>
        </form>

        {process.env.NODE_ENV === "development" && (
          <>
            <div className="sign-in__divider">
              <div className="sign-in__divider-line" />
              <span className="sign-in__divider-label">DEV ONLY</span>
              <div className="sign-in__divider-line" />
            </div>
            <form action={signInWithCredentials} className="sign-in__form">
              <input
                name="email"
                type="email"
                placeholder="Email"
                required
                className="input input--solid-bg"
              />
              <input
                name="password"
                type="password"
                placeholder="Password"
                required
                className="input input--solid-bg"
              />
              <button type="submit" className="btn btn--secondary">
                Dev Sign In
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
