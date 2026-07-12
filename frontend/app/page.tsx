import { redirect } from "next/navigation";

// The workbench is route-based; the root simply lands on the circuit editor.
export default function Home() {
  redirect("/composer");
}
