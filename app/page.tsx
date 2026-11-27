import { connection } from "next/server";
import Workspace from "./workspace";
import { visionSettings, publicVisionSettings } from "../lib/vision/settings";

export default async function Home() {
  await connection();
  return <Workspace vision={publicVisionSettings(visionSettings())} />;
}
