using System.Text.Json;
using System.Linq;

const string DataFile = "game_state.json";

var builder = WebApplication.CreateBuilder(args);

// Configuración JSON camelCase
builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(opt =>
{
    opt.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

// Minimal API, sin DB: persistencia en memoria (singleton)
builder.Services.AddSingleton<GameStateStore>();

// Fijar URL local para pruebas (usar WebHost antes de Build)
builder.WebHost.UseUrls("http://localhost:5280");

var app = builder.Build();

app.Lifetime.ApplicationStarted.Register(() => Console.WriteLine("[STARTED] Servidor arriba en: " + string.Join(", ", app.Urls)));

// Archivos estáticos de wwwroot
app.UseDefaultFiles();
app.UseStaticFiles();

// Endpoint de ping rápido
app.MapGet("/ping", () => "pong");

// Endpoints API
var api = app.MapGroup("/api");

api.MapGet("/state", (GameStateStore store) => Results.Ok(store.State));

api.MapPost("/timer/start", (GameStateStore store, TimerRequest req) =>
{
    if (req.Seconds <= 0 || req.Seconds > 24 * 60 * 60) return Results.BadRequest("Duración inválida");
    if (store.State.Timer.IsRunning) return Results.BadRequest("Ya hay un temporizador en marcha");
    store.State.Timer = new GameTimer
    {
        IsRunning = true,
        StartUtc = DateTimeOffset.UtcNow,
        DurationSeconds = req.Seconds,
        Cancelled = false
    };
    return Results.Ok(store.State.Timer);
});

api.MapPost("/timer/cancel", (GameStateStore store) =>
{
    if (!store.State.Timer.IsRunning) return Results.BadRequest("No hay temporizador activo");
    store.State.Timer.Cancelled = true;
    store.State.Timer.IsRunning = false;
    return Results.Ok(store.State.Timer);
});

// Finaliza el temporizador y otorga puntos si ya concluyó (reclamo manual)
api.MapPost("/timer/claim", (GameStateStore store) =>
{
    var t = store.State.Timer;
    if (!t.IsRunning) return Results.BadRequest("No hay temporizador activo");
    var elapsed = (DateTimeOffset.UtcNow - t.StartUtc).TotalSeconds;
    if (t.Cancelled) return Results.BadRequest("Temporizador cancelado");
    if (elapsed + 0.5 < t.DurationSeconds) return Results.BadRequest("Aún no ha terminado");

    var reward = Math.Max(1, t.DurationSeconds / 5);
    store.State.Points += reward;
    store.State.Timer = new GameTimer();
    CheckAchievements(store.State);
    Persist(store.State);
    return Results.Ok(new { reward, points = store.State.Points, achievements = store.State.Achievements });
});

// Estos endpoints se mantienen para compatibilidad si los necesitas
api.MapGet("/catalog", (GameStateStore store) => Results.Ok(store.State.Catalog));
api.MapGet("/house", (GameStateStore store) => Results.Ok(store.State.House));
api.MapPost("/preview", (GameStateStore store, PurchaseRequest req) =>
{
    var validation = ValidatePurchase(store, req);
    if (validation is { }) return validation; // not-null pattern
    var item = store.State.Catalog.First(c => c.Id == req.ItemId);
    return Results.Ok(new { preview = item });
});
api.MapPost("/purchase", (GameStateStore store, PurchaseRequest req) =>
{
    var validation = ValidatePurchase(store, req);
    if (validation is { }) return validation; // not-null pattern
    var item = store.State.Catalog.First(c => c.Id == req.ItemId);
    if (store.State.Points < item.Cost) return Results.BadRequest("Puntos insuficientes");
    store.State.Points -= item.Cost;
    store.State.House.Placed[req.Slot] = item.Id;
    CheckAchievements(store.State);
    Persist(store.State);
    return Results.Ok(new { points = store.State.Points, placed = store.State.House.Placed, achievements = store.State.Achievements });
});
api.MapGet("/achievements", (GameStateStore store) => Results.Ok(store.State.Achievements));
api.MapGet("/theme", (GameStateStore store) => Results.Ok(new { theme = store.State.Theme }));
api.MapPost("/theme", (GameStateStore store, ThemeRequest req) =>
{
    if (string.IsNullOrWhiteSpace(req.Theme)) return Results.BadRequest("Tema inválido");
    store.State.Theme = req.Theme;
    Persist(store.State);
    return Results.Ok(new { theme = store.State.Theme });
});

// Inicialización de datos de ejemplo
LoadOrSeed(app.Services.GetRequiredService<GameStateStore>());

app.Run();

static IResult? ValidatePurchase(GameStateStore store, PurchaseRequest req)
{
    if (string.IsNullOrWhiteSpace(req.Slot)) return Results.BadRequest("Slot requerido");
    if (string.IsNullOrWhiteSpace(req.ItemId)) return Results.BadRequest("Item requerido");
    if (!store.State.House.Slots.Contains(req.Slot)) return Results.BadRequest("Slot inválido");
    var item = store.State.Catalog.FirstOrDefault(c => c.Id == req.ItemId);
    if (item is null) return Results.BadRequest("Item inválido");
    if (item.Slot != req.Slot) return Results.BadRequest("El item no corresponde al slot");
    return null;
}

static void Persist(GameState state)
{
    var json = JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true });
    File.WriteAllText(DataFile, json);
}

static void LoadOrSeed(GameStateStore store)
{
    if (File.Exists(DataFile))
    {
        try
        {
            var loaded = JsonSerializer.Deserialize<GameState>(File.ReadAllText(DataFile));
            if (loaded is not null)
            {
                store.State.Points = loaded.Points;
                store.State.Timer = loaded.Timer ?? new GameTimer();
                store.State.Theme = loaded.Theme ?? "default";
                store.State.Achievements = loaded.Achievements ?? new();
                store.State.House = loaded.House ?? new House();
                store.State.Catalog.Clear();
                SeedCatalog(store.State);
                return;
            }
        }
        catch { /* ignorar y seed */ }
    }
    // Seed inicial sin reasignar State (solo reseteo de campos)
    store.State.Points = 0;
    store.State.Timer = new GameTimer();
    store.State.Theme = "default";
    store.State.Achievements = new List<string>();
    store.State.House = new House();
    store.State.Catalog.Clear();
    SeedCatalog(store.State);
}

static void SeedCatalog(GameState state)
{
    state.House = new House
    {
        Slots = new List<string> {
            "sofa", "mesa", "lampara", "cuadro",
            "cocina_mueble", "cocina_frigorifico", "cocina_horno",
            "planta_suelo", "planta_colgante",
            "alfombra", "estanteria"
        },
        Placed = state.House.Placed.Count > 0 ? state.House.Placed : new Dictionary<string, string>()
    };
    state.Catalog.AddRange(new[]
    {
        new CatalogItem { Id = "sofa_clasico", Slot = "sofa", Category = "Sala", Name = "Sofá clásico", Cost = 30, Image = "img/sofa1.svg" },
        new CatalogItem { Id = "sofa_moderno", Slot = "sofa", Category = "Sala", Name = "Sofá moderno", Cost = 45, Image = "img/sofa2.svg" },
        new CatalogItem { Id = "mesa_roble", Slot = "mesa", Category = "Sala", Name = "Mesa de roble", Cost = 25, Image = "img/mesa1.svg" },
        new CatalogItem { Id = "mesa_vidrio", Slot = "mesa", Category = "Sala", Name = "Mesa de vidrio", Cost = 35, Image = "img/mesa2.svg" },
        new CatalogItem { Id = "lampara_pie", Slot = "lampara", Category = "Iluminación", Name = "Lámpara de pie", Cost = 20, Image = "img/lampara1.svg" },
        new CatalogItem { Id = "lampara_mod", Slot = "lampara", Category = "Iluminación", Name = "Lámpara moderna", Cost = 32, Image = "img/lampara_mod.svg" },
        new CatalogItem { Id = "cuadro_mar", Slot = "cuadro", Category = "Decoración", Name = "Cuadro marino", Cost = 15, Image = "img/cuadro1.svg" },
        new CatalogItem { Id = "cuadro_montana", Slot = "cuadro", Category = "Decoración", Name = "Cuadro montaña", Cost = 22, Image = "img/cuadro_montana.svg" },
        new CatalogItem { Id = "cocina_mueble_blanco", Slot = "cocina_mueble", Category = "Cocina", Name = "Mueble cocina blanco", Cost = 40, Image = "img/cocina_mueble_blanco.svg" },
        new CatalogItem { Id = "cocina_mueble_madera", Slot = "cocina_mueble", Category = "Cocina", Name = "Mueble cocina madera", Cost = 50, Image = "img/cocina_mueble_madera.svg" },
        new CatalogItem { Id = "frigo_blanco", Slot = "cocina_frigorifico", Category = "Cocina", Name = "Frigorífico blanco", Cost = 55, Image = "img/frigo_blanco.svg" },
        new CatalogItem { Id = "frigo_steel", Slot = "cocina_frigorifico", Category = "Cocina", Name = "Frigorífico acero", Cost = 65, Image = "img/frigo_acero.svg" },
        new CatalogItem { Id = "horno_negro", Slot = "cocina_horno", Category = "Cocina", Name = "Horno negro", Cost = 38, Image = "img/horno_negro.svg" },
        new CatalogItem { Id = "horno_inox", Slot = "cocina_horno", Category = "Cocina", Name = "Horno inox", Cost = 42, Image = "img/horno_inox.svg" },
        new CatalogItem { Id = "planta_alta", Slot = "planta_suelo", Category = "Plantas", Name = "Planta alta", Cost = 18, Image = "img/planta_alta.svg" },
        new CatalogItem { Id = "planta_baja", Slot = "planta_suelo", Category = "Plantas", Name = "Planta baja", Cost = 15, Image = "img/planta_baja.svg" },
        new CatalogItem { Id = "planta_colgante_verde", Slot = "planta_colgante", Category = "Plantas", Name = "Planta colgante verde", Cost = 20, Image = "img/planta_colgante.svg" },
        new CatalogItem { Id = "alfombra_roja", Slot = "alfombra", Category = "Decoración", Name = "Alfombra roja", Cost = 25, Image = "img/alfombra_roja.svg" },
        new CatalogItem { Id = "alfombra_moderna", Slot = "alfombra", Category = "Decoración", Name = "Alfombra moderna", Cost = 30, Image = "img/alfombra_moderna.svg" },
        new CatalogItem { Id = "estanteria_blanca", Slot = "estanteria", Category = "Decoración", Name = "Estantería blanca", Cost = 28, Image = "img/estanteria_blanca.svg" },
        new CatalogItem { Id = "estanteria_madera", Slot = "estanteria", Category = "Decoración", Name = "Estantería madera", Cost = 32, Image = "img/estanteria_madera.svg" },
    });
}

static void CheckAchievements(GameState state)
{
    // Ejemplos de logros simples
    if (!state.Achievements.Contains("Primera compra") && state.House.Placed.Count > 0)
        state.Achievements.Add("Primera compra");
    if (!state.Achievements.Contains("Sala completa") && new[]{"sofa","mesa","lampara","cuadro"}.All(s=> state.House.Placed.ContainsKey(s)))
        state.Achievements.Add("Sala completa");
    if (!state.Achievements.Contains("Cocina completa") && new[]{"cocina_mueble","cocina_frigorifico","cocina_horno"}.All(s=> state.House.Placed.ContainsKey(s)))
        state.Achievements.Add("Cocina completa");
    if (!state.Achievements.Contains("Decoración verde") && state.House.Placed.ContainsKey("planta_suelo") && state.House.Placed.ContainsKey("planta_colgante"))
        state.Achievements.Add("Decoración verde");
}

// Modelos y estado
record TimerRequest(int Seconds);
record PurchaseRequest
{
    public string Slot { get; init; } = string.Empty;
    public string ItemId { get; init; } = string.Empty;
}

class GameStateStore
{
    public GameState State { get; } = new();
}

class GameState
{
    public int Points { get; set; }
    public GameTimer Timer { get; set; } = new();
    public List<CatalogItem> Catalog { get; } = new();
    public House House { get; set; } = new();
    public string Theme { get; set; } = "default";
    public List<string> Achievements { get; set; } = new();
}

class GameTimer
{
    public bool IsRunning { get; set; }
    public DateTimeOffset StartUtc { get; set; }
    public int DurationSeconds { get; set; }
    public bool Cancelled { get; set; }
}

class House
{
    public List<string> Slots { get; set; } = new();
    public Dictionary<string, string> Placed { get; set; } = new();
}

class CatalogItem
{
    public string Id { get; set; } = string.Empty;
    public string Slot { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int Cost { get; set; }
    public string Image { get; set; } = string.Empty;
    public override string ToString() => $"{Name} ({Slot}) - {Cost}pt";
}

record ThemeRequest(string Theme);
