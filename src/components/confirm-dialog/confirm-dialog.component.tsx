import type { ReactNode } from "react";
import { Modal } from "../modal/modal.component.tsx";
import styles from "./confirm-dialog.module.scss";

interface ConfirmDialogProps {
	open: boolean;
	title: string;
	message: ReactNode;
	confirmLabel?: string;
	cancelLabel?: string;
	danger?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

export function ConfirmDialog({
	open,
	title,
	message,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	danger = false,
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	return (
		<Modal
			open={open}
			onClose={onCancel}
			title={title}
			maxWidth={440}
			footer={
				<>
					<button type="button" className="btn btn-ghost" onClick={onCancel}>
						{cancelLabel}
					</button>
					<button
						type="button"
						className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
						onClick={onConfirm}
					>
						{confirmLabel}
					</button>
				</>
			}
		>
			<p className={styles.message}>{message}</p>
		</Modal>
	);
}
