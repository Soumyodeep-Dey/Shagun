import { ReceiptView } from "@/features/gifting/receipt";
export const metadata = {
  title: "Your private receipt",
  robots: { index: false, follow: false },
};
export default function ThankYou() {
  return (
    <div className="shell page max-w-2xl">
      <ReceiptView />
    </div>
  );
}
