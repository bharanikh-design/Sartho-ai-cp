"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function UpdatePassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Make sure we have a session before allowing password update
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/login?error=Session expired. Please request a new password reset link.");
      }
    });
  }, [router, supabase]);

  const validatePassword = (pw: string) => {
    if (pw.length < 8) return "Password must be at least 8 characters long.";
    if (!/[A-Z]/.test(pw)) return "Password must contain at least one uppercase letter.";
    if (!/[0-9]/.test(pw)) return "Password must contain at least one number.";
    if (!/[^A-Za-z0-9]/.test(pw)) return "Password must contain at least one special character.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const validationError = validatePassword(password);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      setTimeout(() => {
        router.push("/");
      }, 2000);
    }
  };

  return (
    <main style={{ maxWidth: "400px", margin: "100px auto", padding: "20px", fontFamily: "sans-serif" }}>
      <h2>Update Password</h2>
      {success ? (
        <div style={{ color: "green", marginTop: "20px" }}>
          Password updated successfully! Redirecting...
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "15px", marginTop: "20px" }}>
          {error && <div style={{ color: "red", padding: "10px", backgroundColor: "#fee" }}>{error}</div>}
          
          <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            New Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ padding: "8px" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            Confirm Password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={{ padding: "8px" }}
            />
          </label>

          <button 
            type="submit" 
            disabled={busy}
            style={{ padding: "10px", background: "black", color: "white", border: "none", cursor: busy ? "not-allowed" : "pointer" }}
          >
            {busy ? "Updating..." : "Update Password"}
          </button>
        </form>
      )}
    </main>
  );
}
