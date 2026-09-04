"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type AdminTableActionsProps = {
  ariaLabel: string;
  detailHref?: string;
  onDetail?: () => void;
  editHref?: string;
  onEdit?: () => void;
  manageLabel?: string;
  onManage?: () => void;
  menuActionLabel?: string;
  onMenuAction?: () => void;
  menuActionTone?: "default" | "destructive";
  onDelete?: () => void;
};

const actionClassName =
  "rounded-md px-2 py-1 text-xs font-medium text-navy-700 transition-colors hover:bg-navy-50 hover:text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-200";

export default function AdminTableActions({
  ariaLabel,
  detailHref,
  onDetail,
  editHref,
  onEdit,
  manageLabel = "Kelola",
  onManage,
  menuActionLabel,
  onMenuAction,
  menuActionTone = "default",
  onDelete,
}: AdminTableActionsProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  function updatePosition() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const menuWidth = 112;
    const menuHeight = 44;
    const viewportPadding = 8;
    const left = Math.max(
      viewportPadding,
      Math.min(
        rect.right - menuWidth,
        window.innerWidth - menuWidth - viewportPadding,
      ),
    );
    const top =
      window.innerHeight - rect.bottom >= menuHeight + viewportPadding
        ? rect.bottom + 4
        : Math.max(viewportPadding, rect.top - menuHeight - 4);

    setPosition({ top, left });
  }

  useEffect(() => {
    if (!open) return;

    updatePosition();
    const closeMenu = () => setOpen(false);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    document.addEventListener("mousedown", closeMenu);

    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      document.removeEventListener("mousedown", closeMenu);
    };
  }, [open]);

  return (
    <div className="inline-flex items-center gap-1 whitespace-nowrap text-left">
      {detailHref && (
        <Link href={detailHref} className={actionClassName}>
          Detail
        </Link>
      )}
      {onDetail && (
        <button type="button" onClick={onDetail} className={actionClassName}>
          Detail
        </button>
      )}
      {editHref && (
        <Link href={editHref} className={actionClassName}>
          Edit
        </Link>
      )}
      {onEdit && (
        <button type="button" onClick={onEdit} className={actionClassName}>
          Edit
        </button>
      )}
      {onManage && (
        <button type="button" onClick={onManage} className={actionClassName}>
          {manageLabel}
        </button>
      )}
      {(onDelete || onMenuAction) && (
        <>
          <button
            ref={triggerRef}
            type="button"
            aria-label={ariaLabel}
            aria-expanded={open}
            onClick={(event) => {
              event.stopPropagation();
              updatePosition();
              setOpen((current) => !current);
            }}
            className="rounded-md px-2 py-1 text-sm leading-none text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-navy-200"
          >
            ⋮
          </button>
          {open &&
            createPortal(
              <div
                role="menu"
                className="fixed z-[100] w-28 rounded-lg border border-gray-200 bg-white p-1 text-left shadow-lg"
                style={position}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    (onMenuAction || onDelete)?.();
                  }}
                  className={`block w-full rounded-md px-3 py-2 text-left text-xs font-medium transition-colors focus:outline-none focus:ring-2 ${
                    menuActionTone === "destructive"
                      ? "text-red-600 hover:bg-red-50 focus:ring-red-200"
                      : "text-gray-700 hover:bg-gray-50 focus:ring-navy-200"
                  }`}
                >
                  {menuActionLabel || "Hapus"}
                </button>
              </div>,
              document.body,
            )}
        </>
      )}
    </div>
  );
}
