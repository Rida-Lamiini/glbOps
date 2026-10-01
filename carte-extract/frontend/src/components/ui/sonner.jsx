import { Toaster as Sonner } from "sonner";

const Toaster = (props) => {
  return (
    <Sonner
      theme="light"
      position="top-right"
      className="gt-toaster"
      toastOptions={{
        classNames: {
          toast: "gt-toast",
          title: "gt-toast-title",
          description: "gt-toast-desc",
          success: "gt-toast-success",
          error: "gt-toast-error",
        },
      }}
      style={{
        "--normal-bg": "var(--panel)",
        "--normal-text": "var(--ink)",
        "--normal-border": "var(--line)",
      }}
      {...props}
    />
  );
};

export { Toaster };
