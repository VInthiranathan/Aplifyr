# Supabase Storage Setup för CV-uppladdning

## Steg 1: Skapa Storage Bucket

1. Gå till din Supabase-dashboard: https://app.supabase.com
2. Välj ditt projekt
3. Gå till **Storage** i vänstermenyn
4. Klicka **New bucket**
5. Fyll i:
   - **Name:** `cvs`
   - **Public bucket:** ✓ (markerad)
6. Klicka **Create bucket**

## Steg 2: Konfigurera Bucket Policies

Storage-bucketen behöver rätt policies för att användare ska kunna ladda upp och läsa sina egna CV:n.

1. I Storage-vyn, klicka på `cvs`-bucketen
2. Gå till **Policies**-fliken
3. Klicka **New policy**

### Policy 1: Låt användare ladda upp sina egna CV:n

```sql
CREATE POLICY "Users can upload their own CVs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'cvs' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### Policy 2: Låt alla läsa CV:n (publika)

```sql
CREATE POLICY "CVs are publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'cvs');
```

### Policy 3: Låt användare uppdatera sina egna CV:n

```sql
CREATE POLICY "Users can update their own CVs"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'cvs' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### Policy 4: Låt användare ta bort sina egna CV:n

```sql
CREATE POLICY "Users can delete their own CVs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'cvs' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

## Steg 3: Verifiera konfigurationen

1. Testa att ladda upp ett CV från användarprofilen i appen
2. Kontrollera att CV-URL:en sparas i `profiles`-tabellen
3. Verifiera att CV:t är tillgängligt via den publika URL:en

## Filstruktur i Bucket

CV:n lagras med följande struktur:

```
cvs/
  ├── {user_id}/
  │   └── cv-{timestamp}.pdf
  ├── {another_user_id}/
  │   └── cv-{timestamp}.pdf
  ...
```

Detta säkerställer att varje användares CV:n är separerade och att användare endast kan hantera sina egna filer.

## Felsökning

### "Access denied" vid uppladdning

- Kontrollera att alla policies är korrekt konfigurerade
- Verifiera att användaren är autentiserad
- Kontrollera att `bucket_id` är exakt `'cvs'`

### CV-URL fungerar inte

- Kontrollera att bucketen är markerad som **Public**
- Verifiera att SELECT-policyn tillåter publikt läsning

### CV sparas inte i databasen

- Kontrollera att `profiles`-tabellen har en `cv_url`-kolumn av typen `text`
- Verifiera att backend kan läsa och skriva till profiles-tabellen
