# Multi-stage build para publicar la app ASP.NET Core
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
# Copiamos todo el repo
COPY . .
# Restaurar y publicar en Release
RUN dotnet restore Cb.Project.Test.sln \
    && dotnet publish Cb.Project.Test/Cb.Project.Test.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
# Puerto configurable; muchos hosts usan 8080
ENV ASPNETCORE_URLS=http://0.0.0.0:8080
EXPOSE 8080
ENTRYPOINT ["dotnet","Cb.Project.Test.dll"]
