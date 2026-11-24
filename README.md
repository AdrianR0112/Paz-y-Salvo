# Paz y Salvo

Aplicación Astro para registrar expedientes laborales, adjuntar evidencias por departamento, calcular la liquidación y generar los PDF. Los expedientes y las evidencias se guardan en IndexedDB por navegador y dirección del sitio. Cada navegador conserva sus propios datos.

## Desarrollo local

Usa Node.js 22.23.4 o posterior.

```sh
npm ci
npm run dev
```

Para revisar la versión estática, ejecuta `npm run build` y luego `npm run preview`.

## GitHub Pages

1. Sube el proyecto, incluido `package-lock.json`, a un repositorio de GitHub con rama `main`.
2. En **Settings → Pages → Build and deployment → Source**, selecciona **GitHub Actions**.
3. Ejecuta **Publicar en GitHub Pages** desde **Actions**, o sube un cambio a `main`. La dirección publicada aparece en el trabajo `deploy`.

El workflow obtiene el dominio y la ruta base desde GitHub Pages y publica el contenido de `dist/`. [Guía de Astro para GitHub Pages](https://docs.astro.build/es/guides/deploy/github/)

## Caso ficticio

Pulsa **Cargar datos del caso ficticio** y **Calcular liquidación**. El neto esperado es **USD 1.292,13**. Descarga y adjunta la evidencia disponible en cada departamento, marca las cuatro revisiones como **Aprobado** y guarda el expediente para habilitar el PDF combinado.
