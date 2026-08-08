import "./globals.css";

export const metadata = {
  title: "BUELO Pickleball Court Booking | Reserve Your Court",
  description: "BUELO real-time pickleball court booking system"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
