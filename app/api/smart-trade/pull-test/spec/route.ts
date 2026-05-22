import { NextResponse } from "next/server";
import { apiTestEndpoints, pathParamNames, retailApiBasePath } from "@/lib/retail-api-endpoints";

export async function GET() {
  return NextResponse.json({
    basePath: retailApiBasePath,
    endpoints: apiTestEndpoints.map((endpoint) => ({
      ...endpoint,
      pathParams: pathParamNames(endpoint.path),
    })),
  });
}
