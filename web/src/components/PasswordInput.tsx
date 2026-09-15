import { useId, useState, type InputHTMLAttributes } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** A password field with a Show/Hide toggle, so people can check what they typed. */
export function PasswordInput({ id, className, ...inputProps }: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div className={className ? `password-field ${className}` : "password-field"}>
      <input id={inputId} type={visible ? "text" : "password"} {...inputProps} />
      <button
        type="button"
        className="password-toggle"
        aria-controls={inputId}
        // The label swaps with the visible text (rather than using aria-pressed) so the spoken name
        // always contains the word on screen.
        aria-label={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((isVisible) => !isVisible)}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
