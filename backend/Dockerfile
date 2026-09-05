FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY ["backend/Examensarbete.Api.csproj", "backend/"]
RUN dotnet restore "backend/Examensarbete.Api.csproj"

COPY backend/ backend/
WORKDIR /src/backend
RUN dotnet publish "Examensarbete.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

COPY --from=build /app/publish .

ENTRYPOINT ["sh", "-c", "dotnet Examensarbete.Api.dll --urls http://0.0.0.0:${PORT:-10000}"]
