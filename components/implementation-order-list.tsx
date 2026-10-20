import type { ImplementationModuleOrder } from "@/lib/implementation-order";

export function ImplementationOrderPreview({ orders }: { orders: ImplementationModuleOrder[] }) {
  const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  return <div className="implementation-order-message">
    <strong>{orders.length} afzonderlijke verkooporder{orders.length === 1 ? "" : "s"}</strong>
    <ul>{orders.map((order, index) => <li key={index}>
      <strong>{order.reference}</strong>: {euro.format(order.totalAmount)}
      <div>Implementatie: {euro.format(order.implementationAmount)} · {order.travelAmount > 0
        ? `Reiskosten: ${euro.format(order.travelAmount)}`
        : order.requiresTravel ? "Geen reiskosten in deze offerte" : "Geen reiskosten: uitvoering op afstand"}</div>
    </li>)}</ul>
  </div>;
}

export function CreatedImplementationOrders({ orders, pending = false }: {
  orders: Array<{ orderId: string; reference: string }>; pending?: boolean;
}) {
  return <div className="implementation-order-message">
    {orders.length > 0 ? <ul>{orders.map(order => <li key={order.orderId}>
      {order.reference} — verkooporder {order.orderId}
    </li>)}</ul> : null}
    {pending ? <p role="status">De orderaanmaak is niet volledig bevestigd. Controleer de eerdere poging in Smart Trade voordat je verdergaat.</p> : null}
  </div>;
}
