# Casa & Temporizador (Demo)

- Backend: ASP.NET Core Minimal API (.NET 9)
- Frontend: HTML/CSS/JS estático

## Ejecutar

```cmd
cd C:\Users\aroyal\RiderProjects\Cb.Project.Test\Cb.Project.Test
 dotnet run
```
Abre http://localhost:5280/

## Endpoints
- GET /api/state
- POST /api/timer/start { seconds }
- POST /api/timer/cancel
- POST /api/preview { slot, itemId }
- POST /api/purchase { slot, itemId }

## Notas
- Un servicio en segundo plano otorga puntos automáticamente cuando el temporizador termina.
- La casa renderiza slots posicionados sobre una imagen de fondo.
- El catálogo está en un panel desplegable en el header.

