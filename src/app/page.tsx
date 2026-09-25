import { Converter } from "@/components/converter";
import { connection } from "next/server";

export default async function Page() {
  await connection();
  return <Converter />;
}
