import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, placement, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport className={toasts.some(toast => toast.open && toast.placement === "bottom-center")
        ? "top-auto bottom-4 left-1/2 right-auto -translate-x-1/2 w-[calc(100vw-2rem)] max-w-md p-0 sm:top-auto sm:bottom-4 sm:right-auto sm:flex-col"
        : undefined} />
    </ToastProvider>
  )
}
