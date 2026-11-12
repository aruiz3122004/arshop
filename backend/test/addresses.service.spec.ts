import "reflect-metadata";
import { AddressesService } from "../src/modules/users/addresses.service";

/**
 * Mock de SupabaseService que simula el patrón builder encadenado. Cada test
 * sobreescribe el comportamiento que necesita.
 */
function createMockSupabase(rows: Record<string, any> = {}) {
  const state = {
    lastInsert: null as any,
    lastUpdate: null as any,
    rows,
  };

  function tableChain(_table: string) {
    const self: any = {
      select() {
        return self;
      },
      eq() {
        return self;
      },
      order() {
        return self;
      },
      insert(payload: any) {
        state.lastInsert = payload;
        return {
          select() {
            return {
              single: async () => ({
                data: { id: "new-id", ...payload },
                error: null,
              }),
            };
          },
        };
      },
      update(patch: any) {
        state.lastUpdate = patch;
        return self;
      },
      delete() {
        return self;
      },
      maybeSingle: async () => ({ data: null, error: null }),
      then: undefined,
    };
    // Make the query thenable so `await` sobre list() devuelve rows
    (self as any).then = (resolve: any) =>
      resolve({ data: state.rows.list ?? [], error: null });
    return self;
  }

  return {
    state,
    admin: {
      from: (table: string) => tableChain(table),
    },
  } as any;
}

describe("AddressesService", () => {
  it("marca is_default=true si es la primera dirección", async () => {
    const supabase = createMockSupabase({ list: [] });
    const svc = new AddressesService(supabase);

    await svc.create("user-1", {
      line1: "Calle 93",
      neighborhood: "Chicó",
      city: "Bogotá",
      department: "Cundinamarca",
      phone: "+573001234567",
    });

    expect(supabase.state.lastInsert).toMatchObject({
      user_id: "user-1",
      line1: "Calle 93",
      is_default: true,
    });
  });

  it("no fuerza is_default=true si ya existen direcciones", async () => {
    const supabase = createMockSupabase({
      list: [{ id: "a1", user_id: "user-1", is_default: true }],
    });
    const svc = new AddressesService(supabase);

    await svc.create("user-1", {
      line1: "Calle 100",
      neighborhood: "Rosales",
      city: "Bogotá",
      department: "Cundinamarca",
      phone: "+573009999999",
    });

    expect(supabase.state.lastInsert.is_default).toBe(false);
  });

  it("respeta isDefault=false explícito aún siendo la primera", async () => {
    const supabase = createMockSupabase({ list: [] });
    const svc = new AddressesService(supabase);

    await svc.create("user-1", {
      line1: "Calle 93",
      neighborhood: "Chicó",
      city: "Bogotá",
      department: "Cundinamarca",
      phone: "+573001234567",
      isDefault: false,
    });

    expect(supabase.state.lastInsert.is_default).toBe(false);
  });
});
