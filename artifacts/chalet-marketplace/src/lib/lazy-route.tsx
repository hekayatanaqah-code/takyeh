import { Component, Suspense, lazy, useState, type ComponentType, type ReactNode } from "react";
import BrandLoadingScreen from "@/components/BrandLoadingScreen";
import { recoverRouteModule } from "@/lib/route-import-retry";

class RouteDownloadError extends Error {
  constructor(cause: unknown) {
    super("Route module could not be downloaded", { cause });
  }
}

class RouteDownloadBoundary extends Component<{
  children: ReactNode;
  retry: () => void;
}, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      // Do not misreport page-rendering bugs as a connectivity problem.
      if (!(this.state.error instanceof RouteDownloadError)) throw this.state.error;
      return (
        <BrandLoadingScreen testId="route-download-error" message="تعذّر تحميل الصفحة. تحقق من الاتصال ثم أعد المحاولة.">
          <small>لن نعيد تحميل المنصة أو نرسل أي بيانات عند إعادة المحاولة.</small>
          <button type="button" onClick={this.props.retry}
            className="mt-4 rounded-xl bg-primary px-6 py-3 text-primary-foreground font-bold">
            إعادة المحاولة
          </button>
        </BrandLoadingScreen>
      );
    }
    return this.props.children;
  }
}

/**
 * The boundary belongs to this route, never to the application/providers.
 * Retry discards only React.lazy's rejected promise, not the document, query
 * cache, sibling forms, authentication state, or any mounted successful page.
 */
export function lazyRoute<M extends { default: ComponentType }>(
  key: string,
  load: () => Promise<M>,
  select: (module: M) => { default: ComponentType } = module => module,
) {
  const makePage = (attempt = 0) => lazy(async () => {
    try {
      return select(await (attempt > 0
        ? recoverRouteModule(key, attempt)
        : load()));
    } catch (cause) {
      throw new RouteDownloadError(cause);
    }
  });
  let CurrentPage = makePage();

  return function LazyRoute() {
    const [{ Page, attempt }, setPage] = useState(() => ({ Page: CurrentPage, attempt: 0 }));
    return (
      <RouteDownloadBoundary key={attempt}
        retry={() => {
          // Reopening this route must use the recovered module, not the
          // rejected lazy instance from the first visit.
          CurrentPage = makePage(attempt + 1);
          setPage(current => ({ Page: CurrentPage, attempt: current.attempt + 1 }));
        }}>
        <Suspense fallback={<BrandLoadingScreen />}>
          <Page />
        </Suspense>
      </RouteDownloadBoundary>
    );
  };
}
