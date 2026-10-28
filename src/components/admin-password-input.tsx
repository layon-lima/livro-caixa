"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function AdminPasswordInput({
  id,
  placeholder,
}: {
  id: string;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="admin-password-field">
      <input
        id={id}
        name="password"
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        minLength={6}
        maxLength={128}
        autoComplete="new-password"
        required
      />
      <button
        type="button"
        className="admin-password-toggle"
        onClick={() => setVisible(current => !current)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
        title={visible ? "Ocultar senha" : "Mostrar senha"}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
