import "./globals.css";

export const metadata = {
  title: "BUELO Pickleball Court Booking | Reserve Your Court",
  description: "BUELO real-time pickleball court booking system",
  icons: {
    icon: "/buelo-icon.webp",
    shortcut: "/buelo-icon.webp",
    apple: "/buelo-icon.webp"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
