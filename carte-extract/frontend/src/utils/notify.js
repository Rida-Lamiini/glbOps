import { toast } from "sonner";

export const notifySuccess = (message) => toast.success(message);
export const notifyError = (message) => toast.error(message);
