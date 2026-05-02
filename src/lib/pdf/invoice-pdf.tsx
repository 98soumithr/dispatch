import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import React from "react";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 11, color: "#0f172a", fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  brand: { fontSize: 22, fontWeight: 700 },
  small: { fontSize: 9, color: "#64748b" },
  meta: { textAlign: "right" },
  metaTitle: { fontSize: 16, fontWeight: 700 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 9, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: 2, borderTopColor: "#0f172a", marginTop: 6 },
  totalLabel: { fontSize: 12, fontWeight: 700 },
  totalValue: { fontSize: 18, fontWeight: 700 },
  footer: { marginTop: 30, fontSize: 9, color: "#64748b" },
});

export type InvoicePdfData = {
  company: { name: string; mc_number: string | null; dot_number: string | null };
  invoiceNumber: string;
  issueDate: Date;
  broker: { name: string | null; email: string };
  load: {
    origin: string;
    destination: string;
    pickup_time: string;
    delivery_time: string | null;
    miles: number;
    rate: number;
  };
  driverName: string;
};

function fmtMoney(v: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(v);
}

function fmtDate(value: string | Date | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function InvoicePdf({ data }: { data: InvoicePdfData }) {
  const ratePerMile = data.load.miles ? data.load.rate / data.load.miles : 0;
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{data.company.name}</Text>
            <Text style={styles.small}>
              MC {data.company.mc_number ?? "—"} · DOT {data.company.dot_number ?? "—"}
            </Text>
          </View>
          <View style={styles.meta}>
            <Text style={styles.metaTitle}>Invoice</Text>
            <Text style={styles.small}>{data.invoiceNumber}</Text>
            <Text style={styles.small}>Issued {fmtDate(data.issueDate)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bill to</Text>
          <Text>{data.broker.name ?? "Broker"}</Text>
          <Text style={styles.small}>{data.broker.email}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Load</Text>
          <View style={styles.row}>
            <Text>Origin</Text>
            <Text>{data.load.origin}</Text>
          </View>
          <View style={styles.row}>
            <Text>Destination</Text>
            <Text>{data.load.destination}</Text>
          </View>
          <View style={styles.row}>
            <Text>Pickup</Text>
            <Text>{fmtDate(data.load.pickup_time)}</Text>
          </View>
          <View style={styles.row}>
            <Text>Delivery</Text>
            <Text>{fmtDate(data.load.delivery_time)}</Text>
          </View>
          <View style={styles.row}>
            <Text>Driver</Text>
            <Text>{data.driverName}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Charges</Text>
          <View style={styles.row}>
            <Text>{`${data.load.miles} miles @ ${fmtMoney(ratePerMile)}/mi`}</Text>
            <Text>{fmtMoney(data.load.rate)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total due</Text>
            <Text style={styles.totalValue}>{fmtMoney(data.load.rate)}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Payment terms: NET 30. Please remit to the address on file.
        </Text>
      </Page>
    </Document>
  );
}
