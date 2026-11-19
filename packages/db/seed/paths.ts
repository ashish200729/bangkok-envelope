import { fileURLToPath } from "node:url";

export const SNAPSHOT_PATH = fileURLToPath(new URL("./asok-osm.json", import.meta.url));
export const SNAPSHOT_GZ_PATH = fileURLToPath(new URL("./asok-osm.json.gz", import.meta.url));
