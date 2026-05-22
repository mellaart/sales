export type ApiTestEndpoint = { method: "GET"; path: string; tag: string; summary: string };

export const retailApiBasePath = "/v3/api";

export const apiTestEndpoints = [
  {
    "method": "GET",
    "path": "/articles",
    "tag": "Articles",
    "summary": "Get article list"
  },
  {
    "method": "GET",
    "path": "/article_groups",
    "tag": "Articles",
    "summary": "Get article group list"
  },
  {
    "method": "GET",
    "path": "/article_groups/{article_group}",
    "tag": "Articles",
    "summary": "Get specific article group"
  },
  {
    "method": "GET",
    "path": "/article_main_groups",
    "tag": "Articles",
    "summary": "Get list of article main groups"
  },
  {
    "method": "GET",
    "path": "/article_main_groups/{article_main_group}",
    "tag": "Articles",
    "summary": "Get specific article main group"
  },
  {
    "method": "GET",
    "path": "/articles/{article}/translations/{field}",
    "tag": "Articles",
    "summary": "Get one or more article field translations"
  },
  {
    "method": "GET",
    "path": "/main_articles",
    "tag": "Articles",
    "summary": "Get list of main articles"
  },
  {
    "method": "GET",
    "path": "/main_articles/{main_article}",
    "tag": "Articles",
    "summary": "Get specific main article"
  },
  {
    "method": "GET",
    "path": "/articles/{article}/stock/warehouses/{warehouse}",
    "tag": "Articles",
    "summary": "Get warehouse stock info."
  },
  {
    "method": "GET",
    "path": "/articles/stock/warehouses/{warehouse}",
    "tag": "Articles",
    "summary": "Get all stock for given warehouse"
  },
  {
    "method": "GET",
    "path": "/asset_classes",
    "tag": "AssetClasses",
    "summary": "Get asset classes list"
  },
  {
    "method": "GET",
    "path": "/assets",
    "tag": "Assets",
    "summary": "Get assets list"
  },
  {
    "method": "GET",
    "path": "/assets/{asset}",
    "tag": "Assets",
    "summary": "Get a specific asset"
  },
  {
    "method": "GET",
    "path": "/asset_custom_fields",
    "tag": "AssetCustomFields",
    "summary": "Get asset custom field list"
  },
  {
    "method": "GET",
    "path": "/choicelists/{choicelist}",
    "tag": "CustomAttributes",
    "summary": "Get custom attribute choicelist"
  },
  {
    "method": "GET",
    "path": "/files/{file}/download",
    "tag": "Files",
    "summary": "Download the specified file."
  },
  {
    "method": "GET",
    "path": "/invoices",
    "tag": "Invoices",
    "summary": "Get invoice list"
  },
  {
    "method": "GET",
    "path": "/knowledge_base/explanations",
    "tag": "Knowledge Base",
    "summary": "/knowledge_base/explanations"
  },
  {
    "method": "GET",
    "path": "/knowledge_base/explanations/{explanation}",
    "tag": "Knowledge Base",
    "summary": "/knowledge_base/explanations/{explanation}"
  },
  {
    "method": "GET",
    "path": "/knowledge_base/menuItems",
    "tag": "Knowledge Base",
    "summary": "/knowledge_base/menuItems"
  },
  {
    "method": "GET",
    "path": "/knowledge_base/menuItems/{menuItem}",
    "tag": "Knowledge Base",
    "summary": "/knowledge_base/menuItems/{menuItem}"
  },
  {
    "method": "GET",
    "path": "/knowledge_base/products",
    "tag": "Knowledge Base",
    "summary": "/knowledge_base/products"
  },
  {
    "method": "GET",
    "path": "/layouts/{type}/{document}",
    "tag": "Documents",
    "summary": "Download a pdf layout for a document"
  },
  {
    "method": "GET",
    "path": "/offers",
    "tag": "Offers",
    "summary": "Fetches a list of offers."
  },
  {
    "method": "GET",
    "path": "/offers/{offer}",
    "tag": "Offers",
    "summary": "Get single offer."
  },
  {
    "method": "GET",
    "path": "/orders",
    "tag": "Orders",
    "summary": "/orders"
  },
  {
    "method": "GET",
    "path": "/orders/{order}",
    "tag": "Orders",
    "summary": "Get single order"
  },
  {
    "method": "GET",
    "path": "/packing_slips",
    "tag": "PackingSlip",
    "summary": "List packing slips"
  },
  {
    "method": "GET",
    "path": "/projects",
    "tag": "Project",
    "summary": "List projects"
  },
  {
    "method": "GET",
    "path": "/projects/{project}",
    "tag": "Project",
    "summary": "Show project"
  },
  {
    "method": "GET",
    "path": "/purchase/invoices",
    "tag": "Purchase",
    "summary": "/purchase/invoices"
  },
  {
    "method": "GET",
    "path": "/purchase/invoices/{purchase_invoice}",
    "tag": "Purchase",
    "summary": "/purchase/invoices/{purchase_invoice}"
  },
  {
    "method": "GET",
    "path": "/purchase/invoices/external/{sourceRelation}/{externalId}",
    "tag": "Purchase",
    "summary": "/purchase/invoices/external/{sourceRelation}/{externalId}"
  },
  {
    "method": "GET",
    "path": "/purchase/orders",
    "tag": "Purchase",
    "summary": "List purchase orders"
  },
  {
    "method": "GET",
    "path": "/purchase/orders/{purchase_order}",
    "tag": "Purchase",
    "summary": "Get single purchase order"
  },
  {
    "method": "GET",
    "path": "/purchase/orders/external/{sourceRelation}/{externalId}",
    "tag": "Purchase",
    "summary": "Get single purchase order by external id"
  },
  {
    "method": "GET",
    "path": "/purchase/receipts",
    "tag": "Purchase",
    "summary": "Get purchase receipts"
  },
  {
    "method": "GET",
    "path": "/purchase/receipts/{purchase_receipt}",
    "tag": "Purchase",
    "summary": "/purchase/receipts/{purchase_receipt}"
  },
  {
    "method": "GET",
    "path": "/relations/{relation}/addresses",
    "tag": "Addresses",
    "summary": "Get address list"
  },
  {
    "method": "GET",
    "path": "/relations/{relation}/addresses/{address}",
    "tag": "Addresses",
    "summary": "Get address"
  },
  {
    "method": "GET",
    "path": "/relations/{relation}/contactpersons",
    "tag": "ContactPersons",
    "summary": "Get contact persons list"
  },
  {
    "method": "GET",
    "path": "/relations/{relation}/contactpersons/{contactperson}",
    "tag": "ContactPersons",
    "summary": "Get contact person"
  },
  {
    "method": "GET",
    "path": "/relations/{relation}/ibans",
    "tag": "Relations",
    "summary": "Get Iban list"
  },
  {
    "method": "GET",
    "path": "/relations/{relation}/mandates",
    "tag": "Relations",
    "summary": "Get all or only available mandates for a relation"
  },
  {
    "method": "GET",
    "path": "/relations/price_agreements",
    "tag": "Relations/PriceAgreements",
    "summary": "Get all price agreements"
  },
  {
    "method": "GET",
    "path": "/relations/{relation}/price_agreements/articles",
    "tag": "Relations/PriceAgreements",
    "summary": "Get price agreements"
  },
  {
    "method": "GET",
    "path": "/relations",
    "tag": "Relations",
    "summary": "Get relations"
  },
  {
    "method": "GET",
    "path": "/relations/{relation}",
    "tag": "Relations",
    "summary": "Get specific relation"
  },
  {
    "method": "GET",
    "path": "/relations/source/{sourceRelation}/id/{externalId}",
    "tag": "Relations",
    "summary": "Get relation by external source and id\nRetrieve a relation using the source relation and external id."
  },
  {
    "method": "GET",
    "path": "/relations/{relation}/revenue",
    "tag": "Revenue",
    "summary": "Get total revenue for given Relation"
  },
  {
    "method": "GET",
    "path": "/relations/{relation}/revenue/by_article_group",
    "tag": "Revenue",
    "summary": "Get total revenue for each article group for a given Relation"
  },
  {
    "method": "GET",
    "path": "/relations/{relation}/revenue/by_month",
    "tag": "Revenue",
    "summary": "Get total revenue for each year/month pair for a given Relation"
  },
  {
    "method": "GET",
    "path": "/countries",
    "tag": "Locale",
    "summary": "Get countries list"
  },
  {
    "method": "GET",
    "path": "/exceptional_dates",
    "tag": "Schedule",
    "summary": "Get a list of exceptional dates. Each entry is a datetime interval during which regular business operations\nmay be affected (e.g. a national holiday or vacation period)"
  },
  {
    "method": "GET",
    "path": "/transport/transport_rides",
    "tag": "Transport",
    "summary": "/transport/transport_rides"
  }
] as ApiTestEndpoint[];

export function getApiTestEndpoint(pathTemplate: string) {
  return apiTestEndpoints.find((endpoint) => endpoint.path === pathTemplate) ?? null;
}

export function pathParamNames(pathTemplate: string) {
  return Array.from(pathTemplate.matchAll(/\{([^}]+)\}/g), (match) => match[1]);
}

export function fillPathTemplate(pathTemplate: string, pathParams: Record<string, unknown>) {
  return pathTemplate.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = pathParams[name];

    if (value === undefined || value === null || String(value).trim() === "") {
      throw new Error(`Padparameter ontbreekt: ${name}`);
    }

    return encodeURIComponent(String(value).trim());
  });
}
