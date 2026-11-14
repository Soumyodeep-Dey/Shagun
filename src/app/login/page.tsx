import { Suspense } from "react";
import { LoginForm } from "@/features/auth/login-form";
export default function Login() {
  return (
    <div className="shell page max-w-xl">
      <p className="eyebrow mb-4">For the happy couple</p>
      <h1 className="text-5xl mb-5">Your story starts here.</h1>
      <p className="muted mb-8">
        Sign in to create your private wishlist. Guests will never need an
        account.
      </p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
