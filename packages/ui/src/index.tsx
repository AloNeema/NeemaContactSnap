import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "ghost" | "danger";
  icon?: ReactNode;
};

export function Button({ tone = "secondary", icon, children, className = "", ...props }: ButtonProps) {
  return (
    <button className={`button button-${tone} ${className}`} {...props}>
      {icon}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="textarea" {...props} />;
}

export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "good" | "warn" | "neutral" }) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

export function Meter({ value }: { value: number }) {
  return (
    <span className="meter" aria-label={`${Math.round(value * 100)} percent confidence`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </span>
  );
}
