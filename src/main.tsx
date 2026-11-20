import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main>
        <h1>مِقدار</h1>
        <p>تعذر فتح الشاشة. أعد تحميل التطبيق. / Please reload the app.</p>
        <button onClick={() => location.reload()}>
          إعادة المحاولة / Retry
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <Boundary>
    <App />
  </Boundary>,
);
void import("web-vitals").then(({ onCLS, onINP, onLCP }) => {
  const log = (metric: unknown) => {
    if (import.meta.env.DEV) console.info("[Web Vital]", metric);
  };
  onCLS(log);
  onINP(log);
  onLCP(log);
});
