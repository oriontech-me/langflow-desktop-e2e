# Langflow Desktop — E2E (Windows)

Testes end-to-end do **IBM Langflow Desktop** com [WebdriverIO](https://webdriver.io) + [`@wdio/tauri-service`](https://webdriver.io/docs/desktop-testing/tauri).

O Langflow Desktop é um app **Tauri** (Rust + WebView2 no Windows). No Windows o WebdriverIO controla o app
com o `tauri-driver` oficial, então testamos o **MSI de QA como ele é** — sem plugin, sem build especial.

> macOS não é coberto aqui: lá o Tauri só é automatizável com um plugin compilado no app
> (`tauri-plugin-wdio-webdriver`). Linux não tem build do Desktop.

## Como funciona

```
langflow-ai/langflow-desktop          este repo (GitHub Actions, windows-latest)
  workflow "Build Unsigned"   ──MSI──▶  baixa artefato langflow-windows-msi
  (pr-build.yml)                        instala com msiexec /qn
                                        tauri-driver + msedgedriver
                                        WebdriverIO abre "Langflow .exe" e roda as specs
                                        publica test-results/ como artefato
```

## Rodar no CI (sem máquina ligada)

1. Crie um **fine-grained PAT** com acesso ao repositório `langflow-ai/langflow-desktop`,
   permissão **Actions: Read** (e Metadata: Read). Precisa de aprovação de um admin da org `langflow-ai`.
2. Salve como secret **`LANGFLOW_DESKTOP_TOKEN`** neste repositório.
3. Rode o workflow **Langflow Desktop E2E (Windows)** em *Actions → Run workflow*:
   - `desktop_branch`: branch do Desktop cujo último build com sucesso será testado (padrão `release-1.13.0`);
   - `desktop_run_id`: opcional, para testar um build específico.
   Por enquanto só roda manualmente: no plano free os minutos de Windows contam em dobro. O agendamento
   (seg–sex 06:00 BRT) está comentado no workflow para ligar quando a suíte estiver estável.
4. Resultado: aba *Summary* do run + artefato `desktop-e2e-windows-<id>` com logs, screenshots de falhas e logs do `~/.langflow`.

Os artefatos MSI do Desktop expiram em **7 dias** — o workflow precisa de um "Build Unsigned" recente na branch.

## Rodar no seu PC Windows (para escrever/depurar testes)

⚠️ O app usa a porta fixa **7860** e a pasta **`%USERPROFILE%\.langflow`**. Os testes vão mexer nos mesmos dados
de um Langflow Desktop que você use no dia a dia, e o fluxo de "primeiro boot" só aparece numa máquina limpa.
Para repetir o primeiro boot, feche o app e renomeie `%USERPROFILE%\.langflow` antes de rodar.

Pré-requisitos: Node 20+, [Rust](https://rustup.rs) (para instalar o `tauri-driver`), Microsoft Edge/WebView2.

```powershell
cargo install tauri-driver --locked
npm ci

# instala um MSI baixado do workflow "Build Unsigned" e descobre o caminho do .exe
$env:LANGFLOW_DESKTOP_EXE = ./scripts/install-langflow-desktop.ps1 -MsiPath C:\caminho\Langflow_1.13.0_x64_en-US.msi
# ou, se já está instalado:
# $env:LANGFLOW_DESKTOP_EXE = "C:\Program Files\Langflow\Langflow.exe"

npm test          # tudo
npm run test:smoke
```

## Estrutura

| Caminho | O quê |
|---|---|
| `wdio.conf.ts` | Config do WebdriverIO + tauri-service (driver oficial, timeouts de primeiro boot, screenshot em falha) |
| `test/specs/first-boot.spec.ts` | Smoke: Termos → Cadastro de e-mail (sem consentimentos) → backend sobe → tela principal |
| `scripts/install-langflow-desktop.ps1` | Instala o MSI silenciosamente e imprime o caminho do executável |
| `.github/workflows/e2e-windows.yml` | Pipeline do CI |

## Escrevendo testes

- Use os `data-testid` do frontend (`langflow-ai/langflow-desktop`, `src/frontend/src/`). As telas próprias do Desktop
  ficam em `src/frontend/src/customization/`; o resto é o frontend do Langflow OSS, os mesmos ids usados no `langflow-e2e`.
- Seletores CSS normais funcionam: `$('[data-testid="..."]')`.
- O runner roda na mesma máquina do app: dá para chamar a API do backend direto de Node (`fetch('http://localhost:7860/...')`)
  para preparar massa ou verificar estado.
- `maxInstances` é 1: só uma instância do app pode rodar por vez (porta fixa).
