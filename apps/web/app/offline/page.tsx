export default function OfflinePage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>AllShops is offline</h1>
        <p>
          The POS can continue with a registered device and completed offline
          bootstrap. Administrative pages require a connection.
        </p>
        <a href="/pos">Return to POS</a>
      </section>
    </main>
  );
}
