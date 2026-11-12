import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface IndexedVariant {
  id: string;
  size: string;
  color_name: string;
  color_hex: string;
  sku: string;
  stock: number;
}

export interface IndexedProduct {
  id: string;
  slug: string;
  name: string;
  brand: string;
  description: string;
  gender: string;
  category: string;
  price_cop: number;
  currency: string;
  images: string[];
  active: boolean;
  total_stock: number;
  created_at: string;
  variants: IndexedVariant[];
}

export interface SearchOptions {
  gender?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  includeInactive?: boolean;
  limit?: number;
}

export interface SearchResultItem {
  product: IndexedProduct;
  score: number;
  matchedFields: string[];
}

export interface SearchResponse {
  query: string;
  total: number;
  tookMs: number;
  source: "elasticsearch" | "isolated-fulltext-engine";
  results: IndexedProduct[];
}

/**
 * Normaliza una cadena quitando acentos y signos para búsqueda full-text.
 * ej: "Algodón" -> "algodon", "Satén" -> "saten"
 */
function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
}

/**
 * Distancia de Levenshtein para tolerancia a errores tipográficos (fuzzy search).
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1,     // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchService.name);
  private readonly esNode?: string;
  private readonly esIndex: string;
  private readonly esApiKey?: string;
  private readonly esAuthHeader?: string;

  private isEsAvailable = false;

  /**
   * Motor Full-Text Aislado en memoria:
   * Almacena el índice invertido y documentos para búsqueda instantánea
   * con cálculo de relevancia, ponderación de campos y fuzzy matching.
   */
  private readonly inMemoryStore = new Map<string, IndexedProduct>();

  constructor(private readonly config: ConfigService) {
    this.esNode = this.config.get<string>("ELASTICSEARCH_NODE") || undefined;
    this.esIndex = this.config.get<string>("ELASTICSEARCH_INDEX") || "arshop_products";
    this.esApiKey = this.config.get<string>("ELASTICSEARCH_API_KEY") || undefined;

    const user = this.config.get<string>("ELASTICSEARCH_USERNAME");
    const pass = this.config.get<string>("ELASTICSEARCH_PASSWORD");
    if (user && pass) {
      this.esAuthHeader = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
    } else if (this.esApiKey) {
      this.esAuthHeader = `ApiKey ${this.esApiKey}`;
    }
  }

  async onModuleInit() {
    if (this.esNode) {
      await this.initElasticsearch();
    } else {
      this.logger.log(
        "Elasticsearch no configurado en entorno. Usando motor Full-Text aislado con índice persistente en memoria.",
      );
    }
  }

  /**
   * Inicializa la conexión con el clúster de Elasticsearch y asegura el mapeo del índice.
   */
  private async initElasticsearch() {
    try {
      const res = await fetch(`${this.esNode}/${this.esIndex}`, {
        method: "HEAD",
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(4000),
      });

      if (res.status === 404) {
        // Crear índice con mapeos para búsqueda inteligente
        await fetch(`${this.esNode}/${this.esIndex}`, {
          method: "PUT",
          headers: this.buildHeaders(),
          body: JSON.stringify({
            settings: {
              analysis: {
                analyzer: {
                  arshop_analyzer: {
                    type: "custom",
                    tokenizer: "standard",
                    filter: ["lowercase", "asciifolding"],
                  },
                },
              },
            },
            mappings: {
              properties: {
                id: { type: "keyword" },
                slug: { type: "text", analyzer: "arshop_analyzer" },
                name: { type: "text", analyzer: "arshop_analyzer", boost: 4 },
                brand: { type: "text", analyzer: "arshop_analyzer", boost: 3 },
                description: { type: "text", analyzer: "arshop_analyzer" },
                gender: { type: "keyword" },
                category: { type: "keyword" },
                price_cop: { type: "double" },
                active: { type: "boolean" },
                total_stock: { type: "integer" },
                "variants.sku": { type: "keyword", boost: 3.5 },
                "variants.color_name": { type: "text", analyzer: "arshop_analyzer" },
              },
            },
          }),
        });
        this.logger.log(`Índice '${this.esIndex}' creado exitosamente en Elasticsearch.`);
      }

      this.isEsAvailable = true;
      this.logger.log(`Conectado a Elasticsearch en: ${this.esNode}`);
    } catch (err: any) {
      this.isEsAvailable = false;
      this.logger.warn(
        `No se pudo conectar a Elasticsearch en ${this.esNode}: ${err?.message}. Corriendo en motor full-text aislado.`,
      );
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.esAuthHeader) {
      headers["Authorization"] = this.esAuthHeader;
    }
    return headers;
  }

  /**
   * Indexa un producto en el motor de búsqueda (Elasticsearch y/o motor aislado).
   */
  async indexProduct(product: IndexedProduct): Promise<void> {
    // 1. Siempre mantener actualizado el motor aislado
    this.inMemoryStore.set(product.id, product);

    // 2. Si Elasticsearch está disponible, sincronizar hacia él
    if (this.isEsAvailable && this.esNode) {
      try {
        const url = `${this.esNode}/${this.esIndex}/_doc/${encodeURIComponent(product.id)}`;
        await fetch(url, {
          method: "PUT",
          headers: this.buildHeaders(),
          body: JSON.stringify(product),
        });
      } catch (err: any) {
        this.logger.error(`Error indexando producto en Elasticsearch: ${err?.message}`);
      }
    }
  }

  /**
   * Indexa en lote una colección de productos.
   */
  async bulkIndex(products: IndexedProduct[]): Promise<void> {
    for (const p of products) {
      this.inMemoryStore.set(p.id, p);
    }

    if (this.isEsAvailable && this.esNode && products.length > 0) {
      try {
        let bulkBody = "";
        for (const p of products) {
          bulkBody += JSON.stringify({ index: { _index: this.esIndex, _id: p.id } }) + "\n";
          bulkBody += JSON.stringify(p) + "\n";
        }
        await fetch(`${this.esNode}/_bulk`, {
          method: "POST",
          headers: { ...this.buildHeaders(), "Content-Type": "application/x-ndjson" },
          body: bulkBody,
        });
      } catch (err: any) {
        this.logger.error(`Error en bulk index de Elasticsearch: ${err?.message}`);
      }
    }

    this.logger.log(`Índice full-text sincronizado con ${products.length} productos.`);
  }

  /**
   * Elimina un producto del índice de búsqueda.
   */
  async removeProduct(productId: string): Promise<void> {
    this.inMemoryStore.delete(productId);

    if (this.isEsAvailable && this.esNode) {
      try {
        await fetch(`${this.esNode}/${this.esIndex}/_doc/${encodeURIComponent(productId)}`, {
          method: "DELETE",
          headers: this.buildHeaders(),
        });
      } catch (err: any) {
        this.logger.error(`Error removiendo producto de Elasticsearch: ${err?.message}`);
      }
    }
  }

  /**
   * Ejecuta búsqueda inteligente con índice full-text.
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const startTime = Date.now();
    const cleanQuery = query.trim();

    // Si Elasticsearch está activo, intentar búsqueda nativa en ES
    if (this.isEsAvailable && this.esNode && cleanQuery.length > 0) {
      try {
        const esResponse = await this.searchElasticsearch(cleanQuery, options);
        if (esResponse) {
          return {
            ...esResponse,
            tookMs: Date.now() - startTime,
            source: "elasticsearch",
          };
        }
      } catch (err: any) {
        this.logger.warn(`Fallo búsqueda Elasticsearch, usando fallback aislado: ${err?.message}`);
      }
    }

    // Búsqueda en el motor Full-Text Aislado
    const results = this.searchInMemory(cleanQuery, options);
    return {
      query: cleanQuery,
      total: results.length,
      tookMs: Date.now() - startTime,
      source: "isolated-fulltext-engine",
      results: results.slice(0, options.limit ?? 100),
    };
  }

  /**
   * Búsqueda en motor full-text aislado en memoria con scoring y fuzzy matching.
   */
  private searchInMemory(query: string, options: SearchOptions): IndexedProduct[] {
    const normQuery = normalizeText(query);
    const queryTokens = normQuery.split(/\s+/).filter(Boolean);

    let candidates = Array.from(this.inMemoryStore.values());

    // Filtros de estado y atributos
    if (!options.includeInactive) {
      candidates = candidates.filter((p) => p.active);
    }
    if (options.gender) {
      candidates = candidates.filter(
        (p) => (p.gender || "").toLowerCase() === options.gender?.toLowerCase(),
      );
    }
    if (options.category) {
      candidates = candidates.filter((p) => p.category === options.category);
    }
    if (options.minPrice !== undefined) {
      candidates = candidates.filter((p) => p.price_cop >= options.minPrice!);
    }
    if (options.maxPrice !== undefined) {
      candidates = candidates.filter((p) => p.price_cop <= options.maxPrice!);
    }

    // Si la búsqueda está vacía, devuelve candidatos filtrados
    if (queryTokens.length === 0) {
      return candidates;
    }

    // Ponderación de relevancia
    const scored: SearchResultItem[] = [];

    for (const prod of candidates) {
      let score = 0;
      const matchedFields: string[] = [];

      const normName = normalizeText(prod.name);
      const normSlug = normalizeText(prod.slug);
      const normBrand = normalizeText(prod.brand);
      const normCategory = normalizeText(prod.category);
      const normDesc = normalizeText(prod.description);
      const skus = prod.variants.map((v) => normalizeText(v.sku));
      const colors = prod.variants.map((v) => normalizeText(v.color_name));

      for (const token of queryTokens) {
        let tokenMatched = false;

        // 1. Coincidencia exacta o contenida en NOMBRE (peso 4.0)
        if (normName.includes(token)) {
          score += 4.0 + (normName.startsWith(token) ? 2.0 : 0);
          matchedFields.push("name");
          tokenMatched = true;
        }

        // 2. Coincidencia en SKU (peso 3.5)
        for (const sku of skus) {
          if (sku.includes(token)) {
            score += 3.5;
            matchedFields.push("sku");
            tokenMatched = true;
            break;
          }
        }

        // 3. Coincidencia en SLUG (peso 3.0)
        if (normSlug.includes(token)) {
          score += 3.0;
          matchedFields.push("slug");
          tokenMatched = true;
        }

        // 4. Coincidencia en MARCA (peso 2.5)
        if (normBrand.includes(token)) {
          score += 2.5;
          matchedFields.push("brand");
          tokenMatched = true;
        }

        // 5. Coincidencia en CATEGORÍA (peso 2.0)
        if (normCategory.includes(token)) {
          score += 2.0;
          matchedFields.push("category");
          tokenMatched = true;
        }

        // 6. Coincidencia en COLOR (peso 1.5)
        for (const c of colors) {
          if (c.includes(token)) {
            score += 1.5;
            matchedFields.push("color");
            tokenMatched = true;
            break;
          }
        }

        // 7. Coincidencia en DESCRIPCIÓN (peso 1.0)
        if (normDesc.includes(token)) {
          score += 1.0;
          matchedFields.push("description");
          tokenMatched = true;
        }

        // 8. Fuzzy Matching (Tolerancia tipográfica para palabras >= 4 caracteres)
        if (!tokenMatched && token.length >= 4) {
          const nameWords = normName.split(/\s+/);
          for (const word of nameWords) {
            if (word.length >= 4 && Math.abs(word.length - token.length) <= 2) {
              const dist = levenshteinDistance(word, token);
              if (dist <= 1) {
                score += 2.0; // Casi exacto con 1 error
                tokenMatched = true;
                matchedFields.push("fuzzy_name");
                break;
              } else if (dist <= 2 && token.length >= 6) {
                score += 1.0;
                tokenMatched = true;
                matchedFields.push("fuzzy_name");
                break;
              }
            }
          }
        }

        // Si este token no coincidió en nada, penalizar
        if (!tokenMatched) {
          score -= 1.0;
        }
      }

      if (score > 0) {
        scored.push({
          product: prod,
          score,
          matchedFields: Array.from(new Set(matchedFields)),
        });
      }
    }

    // Ordenar de mayor a menor relevancia
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.product);
  }

  /**
   * Consulta a cluster Elasticsearch si está activo.
   */
  private async searchElasticsearch(query: string, options: SearchOptions): Promise<Omit<SearchResponse, "tookMs" | "source"> | null> {
    const filters: any[] = [];
    if (!options.includeInactive) {
      filters.push({ term: { active: true } });
    }
    if (options.gender) {
      filters.push({ term: { gender: options.gender.toLowerCase() } });
    }
    if (options.category) {
      filters.push({ term: { category: options.category } });
    }

    const body = {
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query,
                fields: [
                  "name^4",
                  "variants.sku^3.5",
                  "slug^3",
                  "brand^2.5",
                  "category^2",
                  "variants.color_name^1.5",
                  "description^1",
                ],
                fuzziness: "AUTO",
                prefix_length: 2,
              },
            },
          ],
          filter: filters,
        },
      },
      size: options.limit ?? 100,
    };

    const res = await fetch(`${this.esNode}/${this.esIndex}/_search`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const hits = data.hits?.hits || [];
    const results = hits.map((h: any) => h._source as IndexedProduct);

    return {
      query,
      total: data.hits?.total?.value ?? results.length,
      results,
    };
  }

  getStats() {
    return {
      indexedCount: this.inMemoryStore.size,
      elasticsearchConnected: this.isEsAvailable,
      elasticsearchNode: this.esNode || "none",
    };
  }
}
