import BookingApp from "@/components/BookingApp";

export default function HomePage() {
  return (
    <main className="container">
      <section className="hero">

        <div className="heroLogo">
          <img
            src="/buelo-logo.webp"
            alt="BUELO Pickleball"
            className="heroLogoImage"
          />
        </div>

        <div className="heroContent">
          <span className="pill">
            LIVE PICKLEBALL COURT BOOKING
          </span>

          <h1>BUELO Pickleball Court Booking</h1>

          <p>
            Select one or more booking dates, choose UNO or DOS court,
            pick available hourly slots, and see your total instantly
            before submitting.
          </p>
        </div>

      </section>

      <BookingApp />
    </main>
  );
}
