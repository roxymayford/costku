import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Resets the scroll position to the top of the page on every route change.
 * Handles anchor links (#section) by scrolling to the target element instead.
 *
 * Must be rendered inside <BrowserRouter>, above <Routes>.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, hash]);

  return null;
}
