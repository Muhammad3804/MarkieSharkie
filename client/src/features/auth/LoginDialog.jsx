import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { signOut } from "../../api/auth.js";

// The forms (and their validation) load on first use, prefetched once the page is idle, so they stay out of the
// main bundle.
const loadAuthFlow = () => import("./AuthFlow.jsx");
let AuthFlow = lazy(loadAuthFlow);

// A failed chunk load (offline, or a deploy changed the file names) stays inside the modal with a retry, instead of
// taking down the page. lazy() caches the failure, so Try again makes a fresh one.
class LoadBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error("[auth] login form failed", error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const retry = () => {
      AuthFlow = lazy(loadAuthFlow);
      this.setState({ failed: false });
    };
    return (
      <div className="grid min-h-[320px] place-content-center gap-3 text-center">
        <h2
          id="login-title"
          className="font-heading text-[22px] font-semibold text-ink-strong"
        >
          Couldn’t load the login form
        </h2>
        <p id="login-subtitle" className="text-[15px] text-muted-warm">
          Check your connection and try again.
        </p>
        <div className="mt-2 flex justify-center gap-3">
          <button
            type="button"
            onClick={retry}
            className="min-h-11 cursor-pointer rounded-full bg-primary px-5 text-[15px] font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 cursor-pointer rounded-full border border-outline-strong px-5 text-[15px] font-semibold text-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}

const FOCUSABLE =
  'button, a[href], input:not([tabindex="-1"]), select, textarea';

// Login modal: a full-screen sheet on phones, a centred 560px card from sm. Native modal <dialog> like the filter sheet and
// lightbox: the rest of the page is inert, Tab wraps inside, Esc and the backdrop close it, focus returns to the
// trigger, and index.css locks the page scroll. Closing is blocked while a request is running. `openKey` changes on
// every open, so each open starts fresh at the first step.
export default function LoginDialog({
  open,
  openKey,
  intent,
  onClose,
  onSignedIn,
}) {
  const dialog = useRef(null);
  const [busy, setBusy] = useState(null); // what is running: 'google' | 'apple' | 'lookup' | 'password' | ...
  const busyRef = useRef(null);
  // The request still running, if any. The dialog can close under it anyway (back / forward, a forced second
  // Esc); that abandons it, so a late success doesn't log the person in on another page.
  const attempt = useRef(null);
  // Backdrop close needs the press to start on the backdrop too (a text selection dragged out of a field mustn't
  // close the modal).
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const node = dialog.current;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  useEffect(() => {
    const idle =
      window.requestIdleCallback ?? ((callback) => setTimeout(callback, 1500));
    idle(() => loadAuthFlow().catch(() => {}));
  }, []);

  // The dialog's own close event (Esc, backdrop, or `open` turning false): it has already closed, so sync state.
  function handleClosed() {
    attempt.current = null;
    onClose();
  }
  const close = () => !busyRef.current && dialog.current.close();

  // A modal <dialog> makes the page inert, but Tab past the last control still leaves for the browser UI. Wrap it.
  function trapTab(event) {
    if (event.key !== "Tab") return;
    const focusable = [...dialog.current.querySelectorAll(FOCUSABLE)].filter(
      (node) => node.offsetParent !== null || node === document.activeElement,
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // run(kind, task) -> { value } | { error } | { cancelled }. One request at a time.
  const run = useCallback(async (kind, task) => {
    if (busyRef.current) return { cancelled: true };
    const id = Symbol(kind);
    attempt.current = id;
    busyRef.current = kind;
    setBusy(kind);
    try {
      const value = await task();
      return attempt.current === id ? { value } : { cancelled: true, value };
    } catch (error) {
      return attempt.current === id ? { error } : { cancelled: true };
    } finally {
      if (attempt.current === id) attempt.current = null;
      busyRef.current = null;
      setBusy(null);
    }
  }, []);

  // Success reaches onSignedIn before the dialog's close event: the session write re-renders with `open` false, but
  // the close event is a queued task, which runs after this await's continuation (a microtask).
  // Every login method ends here, so each one resumes the trigger's action the same way (useRequireAuth).
  const login = useCallback(
    async (kind, task) => {
      const result = await run(kind, task);
      if (result.cancelled && result.value) signOut();
      else if (result.value) onSignedIn(result.value);
      return result;
    },
    [run, onSignedIn],
  );

  return (
    <dialog
      ref={dialog}
      aria-labelledby="login-title"
      aria-describedby="login-subtitle"
      aria-busy={busy ? true : undefined}
      onCancel={(event) => busyRef.current && event.preventDefault()}
      onKeyDown={trapTab}
      onClose={handleClosed}
      onPointerDown={(event) =>
        (pressedBackdrop.current = event.target === event.currentTarget)
      }
      onClick={(event) =>
        event.target === event.currentTarget &&
        pressedBackdrop.current &&
        close()
      }
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto overscroll-contain rounded-none bg-white p-0 text-ink shadow-modal backdrop:bg-ink-strong/50 backdrop:backdrop-blur-[2px] sm:m-auto sm:h-fit sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-[560px] sm:rounded-3xl motion-safe:transition-[translate,scale,opacity] motion-safe:duration-300 motion-safe:ease-out motion-safe:starting:open:translate-y-full sm:motion-safe:starting:open:translate-y-3 sm:motion-safe:starting:open:scale-[0.97] sm:motion-safe:starting:open:opacity-0"
    >
      <div className="relative px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(4rem,calc(env(safe-area-inset-top)+3.5rem))] sm:px-14 sm:pb-14 sm:pt-14">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          aria-disabled={busy ? true : undefined}
          className="absolute right-3 top-3 z-10 grid size-11 sm:right-5 sm:top-5 cursor-pointer place-items-center rounded-full text-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="m3 3 10 10M13 3 3 13" />
          </svg>
        </button>
        {open && (
          <LoadBoundary>
            <Suspense
              fallback={
                <div
                  className="grid min-h-[420px] place-items-center"
                  aria-busy="true"
                >
                  <h2 id="login-title" className="sr-only">
                    Log in or sign up
                  </h2>
                  <span
                    aria-hidden="true"
                    className="size-6 animate-spin rounded-full border-2 border-primary border-r-transparent motion-reduce:animate-none"
                  />
                </div>
              }
            >
              <AuthFlow
                key={openKey}
                intent={intent}
                busy={busy}
                run={run}
                login={login}
              />
            </Suspense>
          </LoadBoundary>
        )}
      </div>
    </dialog>
  );
}
