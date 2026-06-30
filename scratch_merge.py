deuimport pandas as pd
import json
import sys

try:
    df = pd.read_excel('d:/Projetos/Planilha/predios_escolas_sit_pivot.xlsx', header=7)
    
    escolas = []
    # Drop rows where 'Código da Escola' or 'Estabelecimento de Ensino' is NaN
    df = df.dropna(subset=['Código da Escola', 'Estabelecimento de Ensino'])
    
    for index, row in df.iterrows():
        sre_raw = str(row['SRE']).strip()
        if sre_raw.upper().startswith('SRE '):
            sre_formatted = sre_raw.title()
        else:
            sre_formatted = f"SRE {sre_raw}".title()
        
        # fix SRE formatting: Sre Metropolitana C -> SRE Metropolitana C
        sre_formatted = sre_formatted.replace('Sre ', 'SRE ')
        
        # handle nan or float school codes (e.g. 11037.0)
        codigo_raw = row['Código da Escola']
        if pd.isna(codigo_raw):
            continue
            
        codigo = str(codigo_raw)
        if codigo.endswith('.0'):
            codigo = codigo[:-2]
            
        # pad with leading zero if necessary? Excel might have stripped it, but it was string in the screenshot.
        # Actually in screenshot it's "011037" so it might be string already.
        # Just convert to string.
        codigo = str(codigo_raw).strip()
        
        municipio = str(row['Município']).strip()
        
        nome = str(row['Estabelecimento de Ensino']).strip()
        
        escola = {
            "nome": nome,
            "codigo": codigo,
            "municipio": municipio,
            "sre": sre_formatted
        }
        escolas.append(escola)

    # optionally merge with existing escolas.json if required?
    # the user said "mesclar com a que a gnt ja tem"
    
    with open('d:/Projetos/Planilha/seemg-orcamentos/src/data/escolas.json', 'r', encoding='utf-8') as f:
        existing_escolas = json.load(f)
        
    # merge based on code
    existing_map = { e['codigo']: e for e in existing_escolas }
    
    for new_e in escolas:
        existing_map[new_e['codigo']] = new_e
        
    merged_escolas = list(existing_map.values())
    
    # Sort alphabetically by nome
    merged_escolas.sort(key=lambda x: x['nome'])
    
    with open('d:/Projetos/Planilha/seemg-orcamentos/src/data/escolas.json', 'w', encoding='utf-8') as f:
        json.dump(merged_escolas, f, ensure_ascii=False, indent=2)
        
    print(f"Success! Merged to {len(merged_escolas)} escolas.")
except Exception as e:
    print(f"Error: {e}")
