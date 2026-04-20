-- Adds PDF output path alongside docx/txt paths.
alter table books add column if not exists final_pdf_path text;
