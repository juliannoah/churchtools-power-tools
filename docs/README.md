# docs

Hier liegt die OpenAPI-Spezifikation der ChurchTools-Instanz als
`openapi.json`. Sie ist die einzige Quelle für Endpunkte, Parameter und
Response-Typen – es werden keine Endpunkte geraten.

Die Datei wird **nicht eingecheckt** (ca. 40 MB, fremdes Material von
ChurchTools). Jede Instanz liefert sie ohne Anmeldung aus:

```sh
curl -o docs/openapi.json https://<name>.church.tools/system/runtime/swagger/openapi.json
```

Die lesbare Fassung (Swagger-Oberfläche) steht unter
`https://<name>.church.tools/api`.
