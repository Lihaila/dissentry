import { ArrowLeft, ArrowUpRight, FileText, ShieldCheck } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'wouter';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { LihaiLaBrandLink, LihaiLaFooter, lihailaUrl } from '../components/LihaiLa';
import { Logo } from '../components/Logo';
import { useLang, useT, type Lang } from '../i18n';
import { markStarted } from '../lib/started';

interface Section {
  heading: string;
  body: string[];
}

interface DocCopy {
  title: string;
  updated: string;
  summary: string;
  sections: Section[];
  companyPolicyLabel: string;
}

const PRIVACY: Record<Lang, DocCopy> = {
  en: {
    title: 'Privacy Policy',
    updated: 'Last updated: November 20, 2026',
    summary: 'Dissentry is local-first and collects nothing. There are no accounts, no analytics, no tracking cookies, and Lihai La LLC never sees your API keys, prompts, answers, or dissent notes.',
    companyPolicyLabel: 'See also Lihai La LLC’s general Privacy Policy for all products',
    sections: [
      {
        heading: '1. What Stays on Your Device',
        body: [
          'Dissentry stores all of your data — API keys, model settings, threads, model answers, dissent notes, trust ratings, token usage statistics, and UI preferences — exclusively inside your own browser using IndexedDB and localStorage.',
          'Lihai La LLC cannot view, recover, or delete your local data. You can erase everything at any time from Settings → Clear all data or by clearing site data in your browser.',
        ],
      },
      {
        heading: '2. Direct Requests to Your AI Providers',
        body: [
          'When you send a prompt, regenerate an answer, or run fact-checkers, Dissentry sends the request directly from your browser to the AI providers you configured (such as OpenAI, Anthropic, Google Gemini, DeepSeek, Qwen, xAI, Mistral, Groq, OpenRouter, Ollama, LM Studio, or your custom endpoint).',
          'Those providers receive your prompts, conversation context, and API key directly, and handle them under their own privacy policies and data retention terms. Your keys and prompts never pass through Lihai La servers.',
        ],
      },
      {
        heading: '3. Sign in with OpenRouter (OAuth PKCE)',
        body: [
          'If you choose “Sign in with OpenRouter”, authentication uses OAuth 2.0 PKCE directly between your browser and openrouter.ai. The resulting OpenRouter API key is stored only in your browser’s IndexedDB and is never sent to Lihai La.',
          'You can inspect or revoke that key at any time at openrouter.ai/keys.',
        ],
      },
      {
        heading: '4. Local Mode (npx dissentry, Local MCP & Docker)',
        body: [
          'When you run Dissentry on your own computer via npx dissentry, npx dissentry mcp, or Docker, the bundled local server listens on your machine (127.0.0.1 by default) to serve the web app, expose Local MCP, and act as a stateless pass-through proxy for local models and optional HTTP/HTTPS/SOCKS5 network proxies.',
          'The local server stores your settings only on your own device (~/.dissentry/data.json with owner-only permissions) and never sends them to Lihai La.',
        ],
      },
      {
        heading: '5. Optional Hosted Cloud MCP (dissentry.lihaila.com/v1/mcp)',
        body: [
          'If you explicitly connect the optional Hosted Cloud MCP endpoint from an MCP client (such as Google App / Gemini, Claude, Cursor, or ChatGPT), authorization uses OAuth 2.1 with PKCE. Your OpenRouter or provider API keys are encrypted inside your OAuth Bearer token using AES-256-GCM and are never persisted in any server database.',
          'When your MCP client invokes a tool (dissentry_check, dissentry_ask, dissentry_list_models), the Cloud MCP service decrypts your token in memory, forwards the request strictly over HTTPS to allowlisted AI provider endpoints, and returns the result without logging or storing prompts, answers, or dissent notes.',
        ],
      },
      {
        heading: '6. Share as Image & JSON Export',
        body: [
          'Shareable PNG cards and JSON backups are rendered and generated entirely on your device. Nothing is uploaded to Lihai La when you copy, download, or share an image.',
          'If you export with “Export with API keys”, the downloaded JSON file contains your API keys in plain text — store it securely and do not share it publicly.',
        ],
      },
      {
        heading: '7. Hosting & Contact',
        body: [
          'The hosted static version at dissentry.lihaila.com is served without user accounts, analytics scripts, or advertising trackers. Standard web server infrastructure may temporarily process routine HTTP access metadata (such as IP address, user agent, and requested static asset path) to deliver files and protect against abuse.',
          'Questions about privacy? Email contact@lihaila.com or write to Lihai La LLC, 1111B S Governors Ave STE 34093, Dover, DE 19904, USA.',
        ],
      },
    ],
  },
  zh: {
    title: '隐私政策',
    updated: '最后更新：2026年11月20日',
    summary: 'Dissentry 采用本地优先设计，不收集任何个人数据。无需注册账号，无统计埋点，无追踪 Cookie，Lihai La LLC 绝不会接触你的 API 密钥、提问内容、回答或纠错注释。',
    companyPolicyLabel: '查看 Lihai La LLC 全线产品通用隐私政策',
    sections: [
      {
        heading: '1. 保存在你设备上的数据',
        body: [
          'Dissentry 将你的所有数据——包括 API 密钥、模型配置、对话帖子、模型回答、纠错注释、可信度评价、token 用量统计和界面设置——仅保存在你当前浏览器的 IndexedDB 和 localStorage 中。',
          'Lihai La LLC 无法查看、恢复或代你删除这些本地数据。你可以随时在“设置 → 清除所有数据”中一键删除，或直接清除浏览器站点数据。',
        ],
      },
      {
        heading: '2. 直连你选择的 AI 服务商',
        body: [
          '当你提问、重新生成回答或运行核查员模型时，请求会从你的浏览器直接发往你配置的 AI 服务商（如 OpenAI、Anthropic、Google Gemini、DeepSeek、千问、xAI、Mistral、Groq、OpenRouter、Ollama、LM Studio 或自定义接口）。',
          '这些服务商会直接收到你的提示词、上下文与 API 密钥，并遵循各自的数据政策与隐私条款。你的密钥和对话不会经过 Lihai La 的服务器。',
        ],
      },
      {
        heading: '3. 使用 OpenRouter 登录（OAuth PKCE）',
        body: [
          '如果你选择“使用 OpenRouter 登录”，授权通过 OAuth 2.0 PKCE 在你的浏览器与 openrouter.ai 之间直接完成。获得的密钥仅保存在你的浏览器中，不会发送给 Lihai La。',
          '你可以随时在 openrouter.ai/keys 查看或吊销该密钥。',
        ],
      },
      {
        heading: '4. 本地模式（npx dissentry、本地 MCP 与 Docker）',
        body: [
          '当你通过 npx dissentry、npx dissentry mcp 或 Docker 在自己电脑上运行时，内置的本地服务器仅监听在本机（默认 127.0.0.1），用于提供网页界面、本地 MCP 及无状态透传代理。',
          '本地数据仅保存在你的设备（~/.dissentry/data.json，仅当前系统用户可读），绝不会发送给 Lihai La。',
        ],
      },
      {
        heading: '5. 可选云端托管 MCP（dissentry.lihaila.com/v1/mcp）',
        body: [
          '仅当你主动在 Google App（Gemini）、Claude、Cursor 或 ChatGPT 等客户端接入可选的云端托管 MCP 端点时，授权通过 OAuth 2.1（PKCE）完成。你的 OpenRouter 或服务商 API 密钥会以 AES-256-GCM 加密封装在你自己的 OAuth 令牌中，绝不写入任何服务端数据库。',
          '当客户端调用工具（dissentry_check、dissentry_ask、dissentry_list_models）时，云端服务仅在内存中解密令牌并将请求通过 HTTPS 转发至白名单 AI 服务商，不记录、不存储你的提问、回答或异议内容。',
        ],
      },
      {
        heading: '6. 分享为图片与数据导出',
        body: [
          '分享 PNG 卡片和 JSON 备份均完全在你的设备上生成，复制、下载或分享图片时不会上传任何数据到服务器。',
          '若你选择“连同 API 密钥导出”，生成的 JSON 文件会包含明文密钥，请妥善保管，切勿公开分享。',
        ],
      },
      {
        heading: '7. 托管服务与联系我们',
        body: [
          'dissentry.lihaila.com 托管版仅提供静态网页文件，不包含用户账号系统、第三方统计脚本或广告追踪器。标准 Web 服务器基础设施在提供静态文件及防止滥用时，可能短暂处理常规 HTTP 访问日志（如 IP 地址与请求路径），其中不包含任何提示词或 API 密钥。',
          '如有隐私相关问题，请联系 contact@lihaila.com，或致函 Lihai La LLC, 1111B S Governors Ave STE 34093, Dover, DE 19904, USA。',
        ],
      },
    ],
  },
  ja: {
    title: 'プライバシーポリシー',
    updated: '最終更新日：2026年11月20日',
    summary: 'Dissentry はローカルファースト設計で、個人データを一切収集しません。アカウント不要、アナリティクスなし、トラッキング Cookie なし。Lihai La LLC があなたの API キーや会話内容を見ることはありません。',
    companyPolicyLabel: 'Lihai La LLC 全製品共通のプライバシーポリシーを見る',
    sections: [
      {
        heading: '1. お使いの端末に保存されるデータ',
        body: [
          'API キー、モデル設定、投稿、AI の回答、異議の注記、信頼度評価、トークン使用量、画面設定はすべてお使いのブラウザ内（IndexedDB および localStorage）のみに保存されます。',
          'Lihai La LLC はこれらのデータを閲覧・復元・削除できません。「設定 → 全データを消去」またはブラウザのサイトデータ消去でいつでも完全に削除できます。',
        ],
      },
      {
        heading: '2. AI プロバイダーへの直接送信',
        body: [
          '質問の送信やチェック実行時、リクエストはブラウザから設定した AI プロバイダー（OpenAI、Anthropic、Google Gemini、DeepSeek、Qwen、xAI、Mistral、Groq、OpenRouter、Ollama、LM Studio 等）へ直接送信されます。',
          '各プロバイダーでのデータ取り扱いはそれぞれのプライバシーポリシーに従います。キーや会話が Lihai La のサーバーを通ることはありません。',
        ],
      },
      {
        heading: '3. OpenRouter サインイン（OAuth PKCE）',
        body: [
          '「OpenRouter でサインイン」を利用すると、ブラウザと openrouter.ai の間で直接 OAuth 2.0 PKCE 認証を行います。発行されたキーはブラウザ内のみに保存され、openrouter.ai/keys からいつでも確認・失効できます。',
        ],
      },
      {
        heading: '4. ローカル実行（npx dissentry / ローカル MCP / Docker）',
        body: [
          'npx dissentry や npx dissentry mcp、Docker でローカル実行する場合、同梱サーバーは自分の端末（既定 127.0.0.1）で動作し、設定は端末内の ~/.dissentry/data.json のみに保存されます。',
        ],
      },
      {
        heading: '5. 任意のクラウド MCP（dissentry.lihaila.com/v1/mcp）',
        body: [
          'Google App（Gemini）・Claude・Cursor 等から任意のクラウド MCP に接続した場合のみ、OAuth 2.1（PKCE）で認証を行います。API キーは AES-256-GCM で暗号化して OAuth トークン内に保持され、サーバーのデータベースには保存されません。リクエストはメモリ上でのみ許可済み AI プロバイダーへ転送され、会話内容は記録・保存されません。',
        ],
      },
      {
        heading: '6. 画像共有とデータエクスポート',
        body: [
          '共有用 PNG 画像や JSON バックアップはすべて端末内で生成されます。サーバーへのアップロードは行いません。「API キーも含めてエクスポート」したファイルにはキーが平文で含まれるため安全に管理してください。',
        ],
      },
      {
        heading: '7. ホスティングとお問い合わせ',
        body: [
          'dissentry.lihaila.com は静的ファイルとして配信され、アカウントやトラッカーを含みません。配信や不正対策のため、通常の Web サーバーログ（IP アドレスや静的ファイルパス等）が一時的に処理される場合がありますが、プロンプトや API キーは含まれません。',
          'お問い合わせ：contact@lihaila.com（Lihai La LLC, 1111B S Governors Ave STE 34093, Dover, DE 19904, USA）',
        ],
      },
    ],
  },
  ko: {
    title: '개인정보 처리방침',
    updated: '최종 업데이트: 2026년 11월 20일',
    summary: 'Dissentry는 로컬 우선으로 설계되었으며 아무것도 수집하지 않습니다. 계정, 애널리틱스, 추적 쿠키가 없으며 Lihai La LLC는 사용자의 API 키, 질문, 답변 또는 메모를 볼 수 없습니다.',
    companyPolicyLabel: 'Lihai La LLC 전체 제품 개인정보 처리방침 보기',
    sections: [
      {
        heading: '1. 내 기기에만 저장되는 데이터',
        body: [
          'API 키, 모델 설정, 스레드, 답변, 이의 메모, 신뢰도 평가, 토큰 사용량, 언어 설정은 모두 현재 브라우저의 IndexedDB와 localStorage에만 저장됩니다.',
          'Lihai La LLC는 이 데이터를 열람하거나 복구하거나 삭제할 수 없습니다. 언제든지 설정 → 모든 데이터 지우기 또는 브라우저 사이트 데이터 삭제로 완전히 제거할 수 있습니다.',
        ],
      },
      {
        heading: '2. AI 제공자로의 직접 요청',
        body: [
          '질문을 보내거나 검증을 실행하면 요청이 브라우저에서 사용자가 설정한 AI 제공자(OpenAI, Anthropic, Google Gemini, DeepSeek, Qwen, xAI, Mistral, Groq, OpenRouter, Ollama, LM Studio 등)로 직접 전송됩니다.',
          '프롬프트와 API 키는 해당 제공자의 개인정보 처리방침에 따라 처리되며 Lihai La 서버를 거치지 않습니다.',
        ],
      },
      {
        heading: '3. OpenRouter 로그인 (OAuth PKCE)',
        body: [
          'OpenRouter 로그인을 사용하면 브라우저와 openrouter.ai 사이에서 직접 OAuth 2.0 PKCE 인증이 이루어집니다. 발급된 키는 브라우저에만 저장되며 openrouter.ai/keys에서 언제든지 확인하거나 폐기할 수 있습니다.',
        ],
      },
      {
        heading: '4. 로컬 모드 (npx dissentry / 로컬 MCP / Docker)',
        body: [
          'npx dissentry, npx dissentry mcp 또는 Docker로 로컬 실행 시 내장 서버는 내 컴퓨터(기본 127.0.0.1)에서만 실행되며 설정은 내 기기의 ~/.dissentry/data.json에만 저장됩니다.',
        ],
      },
      {
        heading: '5. 선택적 클라우드 MCP (dissentry.lihaila.com/v1/mcp)',
        body: [
          'Google App(Gemini), Claude, Cursor 등에서 선택적 클라우드 MCP에 직접 연결한 경우에만 OAuth 2.1(PKCE) 인증을 사용합니다. API 키는 AES-256-GCM으로 암호화되어 OAuth 토큰 내부에만 보관되며 서버 데이터베이스에 저장되지 않습니다. 도구 요청은 메모리에서만 허용된 AI 제공자로 전달되며 프롬프트와 답변은 기록·저장되지 않습니다.',
        ],
      },
      {
        heading: '6. 이미지 공유 및 백업 내보내기',
        body: [
          '공유용 PNG 카드와 JSON 백업은 모두 기기 내에서 생성되며 서버에 업로드되지 않습니다. "API 키 포함 내보내기" 파일에는 키가 평문으로 포함되므로 안전하게 보관하세요.',
        ],
      },
      {
        heading: '7. 호스팅 및 문의',
        body: [
          'dissentry.lihaila.com은 계정이나 추적 스크립트 없이 정적 파일로 제공됩니다. 파일 전송 및 남용 방지를 위해 일반 웹 서버 접근 로그(IP 주소, 정적 파일 경로 등)가 일시적으로 처리될 수 있으나, 프롬프트나 API 키는 포함되지 않습니다.',
          '문의: contact@lihaila.com (Lihai La LLC, 1111B S Governors Ave STE 34093, Dover, DE 19904, USA)',
        ],
      },
    ],
  },
};

const TERMS: Record<Lang, DocCopy> = {
  en: {
    title: 'Terms of Service',
    updated: 'Last updated: November 20, 2026',
    summary: 'Dissentry is free and open source under the MIT License, provided by Lihai La LLC. You bring your own AI keys and are responsible for your provider usage and reviewing AI-generated answers.',
    companyPolicyLabel: 'See also Lihai La LLC’s general Terms of Service for all products',
    sections: [
      {
        heading: '1. Acceptance & Open-Source License',
        body: [
          'Dissentry (dissentry.lihaila.com and the dissentry npm package) is developed and operated by Lihai La LLC (“Lihai La”, “we”, “us”). By accessing or using Dissentry, you agree to these Terms of Service.',
          'Dissentry’s source code is released under the MIT License at github.com/Lihaila/dissentry. Nothing in these terms limits the rights granted to you under the MIT License for the open-source codebase.',
        ],
      },
      {
        heading: '2. Bring Your Own Keys & Third-Party Providers',
        body: [
          'Dissentry connects to third-party AI model providers (such as OpenAI, Anthropic, Google, DeepSeek, Qwen, xAI, Mistral, Groq, OpenRouter) or your own local models (Ollama, LM Studio) using credentials you provide.',
          'You are solely responsible for all API fees billed by your chosen providers and for complying with their terms of service, including any rules restricting third-party use of consumer subscriptions.',
        ],
      },
      {
        heading: '3. AI Outputs & Dissent Notes',
        body: [
          'Answers, dissent notes, disputed-claim highlights, and trust statistics are generated automatically by AI models and your own ratings. Automated checkers reduce errors but cannot guarantee accuracy.',
          'Do not rely on Dissentry outputs as professional medical, legal, financial, or safety-critical advice without independent verification.',
        ],
      },
      {
        heading: '4. Your Data & Backups',
        body: [
          'You retain all rights to your prompts, exports, and generated images. Because Dissentry stores everything locally in your browser without accounts or cloud sync, you are responsible for backing up important threads (Settings → Export) and protecting access to your device and exported key files.',
        ],
      },
      {
        heading: '5. Acceptable Use',
        body: [
          'You agree not to disrupt, overload, or attempt to compromise the hosted site at dissentry.lihaila.com, and not to use Dissentry in violation of applicable law.',
        ],
      },
      {
        heading: '6. Disclaimer & Limitation of Liability',
        body: [
          'Dissentry is provided “AS IS” and “AS AVAILABLE”, without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, or non-infringement.',
          'To the maximum extent permitted by law, Lihai La LLC shall not be liable for any indirect, incidental, special, consequential, or punitive damages, third-party AI provider charges, or loss of browser-stored data.',
        ],
      },
      {
        heading: '7. Changes, Governing Law & Contact',
        body: [
          'We may update these terms from time to time; the date at the top reflects the latest revision. These terms are governed by the laws of the State of Delaware, United States.',
          'Questions? Contact contact@lihaila.com or Lihai La LLC, 1111B S Governors Ave STE 34093, Dover, DE 19904, USA.',
        ],
      },
    ],
  },
  zh: {
    title: '服务条款',
    updated: '最后更新：2026年11月20日',
    summary: 'Dissentry 由 Lihai La LLC 提供，基于 MIT 许可证免费开源。你使用自己的 AI 密钥或本地模型，并自行承担各服务商费用及对 AI 输出内容的核实责任。',
    companyPolicyLabel: '查看 Lihai La LLC 全线产品通用服务条款',
    sections: [
      {
        heading: '1. 条款接受与开源许可',
        body: [
          'Dissentry（dissentry.lihaila.com 及 dissentry npm 包）由 Lihai La LLC 开发与维护。访问或使用 Dissentry 即表示你同意本服务条款。',
          'Dissentry 源代码在 github.com/Lihaila/dissentry 以 MIT 许可证开源。本条款不限制 MIT 许可证授予你的源代码使用权利。',
        ],
      },
      {
        heading: '2. 自带密钥与第三方服务商',
        body: [
          'Dissentry 使用你自行提供的密钥连接第三方 AI 服务商（如 OpenAI、Anthropic、Google、DeepSeek、千问、xAI、Mistral、Groq、OpenRouter）或你的本地模型（Ollama、LM Studio）。',
          '你需自行承担所选 AI 服务商产生的全部费用，并遵守各服务商的服务条款（包括不得违反服务商关于禁止在第三方应用中使用个人消费级订阅的规定）。',
        ],
      },
      {
        heading: '3. AI 输出与纠错注释',
        body: [
          '回答、纠错注释、争议句标红与可信度统计均由 AI 模型及你的手动评价生成。多模型核查能减少错误，但无法保证完全准确。',
          '请勿在未经独立核实的情况下，将 Dissentry 的输出作为专业医疗、法律、财务或安全关键决策的唯一依据。',
        ],
      },
      {
        heading: '4. 你的数据与备份',
        body: [
          '你保留对自己输入内容、导出文件与分享图片的全部权利。由于 Dissentry 仅在浏览器本地保存数据、不提供云端同步，请你自行通过“设置 → 导出”做好重要内容备份，并妥善保管你的设备与密钥文件。',
        ],
      },
      {
        heading: '5. 合理使用',
        body: [
          '你同意不干扰、攻击或破坏 dissentry.lihaila.com 的正常运行，亦不将 Dissentry 用于违反适用法律法规的用途。',
        ],
      },
      {
        heading: '6. 免责声明与责任限制',
        body: [
          'Dissentry 按“现状”与“可用”基础提供，不附带任何明示或默示保证（包括适销性、特定用途适用性及不侵权保证）。',
          '在法律允许的最大范围内，Lihai La LLC 不对任何间接、附带、特殊或后果性损害、第三方 AI 服务商账单费用或浏览器本地数据丢失承担责任。',
        ],
      },
      {
        heading: '7. 条款更新、适用法律与联系',
        body: [
          '我们可能会不时更新本条款，顶部日期标明最新修订时间。本条款受美国特拉华州法律管辖。',
          '如有疑问，请联系 contact@lihaila.com（Lihai La LLC, 1111B S Governors Ave STE 34093, Dover, DE 19904, USA）。',
        ],
      },
    ],
  },
  ja: {
    title: '利用規約',
    updated: '最終更新日：2026年11月20日',
    summary: 'Dissentry は Lihai La LLC が MIT ライセンスで提供する無料オープンソースソフトです。API キーやプロバイダー料金、AI 出力の最終確認はご自身の責任となります。',
    companyPolicyLabel: 'Lihai La LLC 全製品共通の利用規約を見る',
    sections: [
      {
        heading: '1. 同意とオープンソースライセンス',
        body: [
          'Dissentry（dissentry.lihaila.com および npm パッケージ dissentry）は Lihai La LLC が提供しています。本サービスを利用することで本規約に同意したものとみなされます。',
          'ソースコードは github.com/Lihaila/dissentry にて MIT ライセンスで公開されています。本規約は MIT ライセンスに基づく権利を制限しません。',
        ],
      },
      {
        heading: '2. 自身の API キーと第三者プロバイダー',
        body: [
          'Dissentry は、あなたが設定した認証情報を用いて第三者 AI プロバイダーまたはローカルモデル（Ollama / LM Studio）に接続します。',
          '各プロバイダーからの請求料金および利用規約の遵守（個人向けサブスクリプションの不正利用禁止等を含む）は、すべて利用者ご自身の責任となります。',
        ],
      },
      {
        heading: '3. AI の回答と異議の注記',
        body: [
          '回答、異議の注記、下線表示、信頼度スコアは AI モデルとあなたの評価に基づき自動生成されます。正確性を保証するものではありません。',
          '医療・法律・金融・安全に関わる判断には、必ず独立した確認を行ってください。',
        ],
      },
      {
        heading: '4. データとバックアップ',
        body: [
          '入力内容および生成物の権利は利用者に帰属します。データはブラウザ内のみに保存されるため、重要な会話は「設定 → エクスポート」でバックアップし、端末とキーファイルを安全に管理してください。',
        ],
      },
      {
        heading: '5. 禁止事項',
        body: [
          'dissentry.lihaila.com への妨害・攻撃行為や、適用法令に違反する利用を行わないことに同意します。',
        ],
      },
      {
        heading: '6. 免責および責任制限',
        body: [
          'Dissentry は「現状有姿」で提供され、明示・黙示を問わず一切の保証を行いません。法律で許容される最大限の範囲において、Lihai La LLC は間接損害、AI プロバイダーの利用料金、ブラウザ内のデータ消失について責任を負いません。',
        ],
      },
      {
        heading: '7. 変更・準拠法・お問い合わせ',
        body: [
          '本規約は随時改定される場合があります。本規約は米国デラウェア州法に準拠します。お問い合わせ：contact@lihaila.com（Lihai La LLC, 1111B S Governors Ave STE 34093, Dover, DE 19904, USA）。',
        ],
      },
    ],
  },
  ko: {
    title: '서비스 이용약관',
    updated: '최종 업데이트: 2026년 11월 20일',
    summary: 'Dissentry는 Lihai La LLC가 MIT 라이선스로 제공하는 무료 오픈소스 소프트웨어입니다. API 키 관리, 제공자 요금, AI 답변의 최종 확인은 사용자 본인의 책임입니다.',
    companyPolicyLabel: 'Lihai La LLC 전체 제품 이용약관 보기',
    sections: [
      {
        heading: '1. 동의 및 오픈소스 라이선스',
        body: [
          'Dissentry(dissentry.lihaila.com 및 npm 패키지 dissentry)는 Lihai La LLC가 개발·운영합니다. Dissentry를 이용하면 본 약관에 동의하는 것으로 간주됩니다.',
          '소스 코드는 github.com/Lihaila/dissentry에서 MIT 라이선스로 공개되며, 본 약관은 MIT 라이선스가 부여하는 권리를 제한하지 않습니다.',
        ],
      },
      {
        heading: '2. 개인 API 키 및 제3자 제공자',
        body: [
          'Dissentry는 사용자가 직접 입력한 키로 제3자 AI 제공자 또는 로컬 모델(Ollama, LM Studio)에 연결합니다.',
          '선택한 AI 제공자의 이용 요금과 약관 준수(소비자용 구독의 타사 앱 사용 금지 등 포함)는 전적으로 사용자의 책임입니다.',
        ],
      },
      {
        heading: '3. AI 출력 및 이의 메모',
        body: [
          '답변, 이의 메모, 밑줄 표시, 신뢰도 지표는 AI 모델과 사용자의 평가에 의해 자동 생성되며 완전한 정확성을 보장하지 않습니다.',
          '의료, 법률, 금융 등 중요한 판단에는 반드시 별도의 검증을 거치시기 바랍니다.',
        ],
      },
      {
        heading: '4. 데이터 및 백업',
        body: [
          '작성한 프롬프트와 내보낸 콘텐츠의 권리는 사용자에게 있습니다. 모든 데이터가 브라우저 로컬에만 저장되므로 중요한 기록은 설정 → 내보내기로 백업하고 기기와 키 파일을 안전하게 관리해 주세요.',
        ],
      },
      {
        heading: '5. 허용되는 사용',
        body: [
          'dissentry.lihaila.com의 정상 운영을 방해하거나 공격하지 않으며, 관련 법령을 위반하는 용도로 사용하지 않을 것에 동의합니다.',
        ],
      },
      {
        heading: '6. 보증 부인 및 책임 제한',
        body: [
          'Dissentry는 명시적·묵시적 보증 없이 “있는 그대로(AS IS)” 제공됩니다. 법이 허용하는 최대 범위 내에서 Lihai La LLC는 간접·부수적 손해, 제3자 AI 요금, 브라우저 저장 데이터 손실에 대해 책임지지 않습니다.',
        ],
      },
      {
        heading: '7. 변경, 준거법 및 문의',
        body: [
          '본 약관은 수시로 업데이트될 수 있으며 미국 델라웨어주 법률을 따릅니다. 문의: contact@lihaila.com (Lihai La LLC, 1111B S Governors Ave STE 34093, Dover, DE 19904, USA).',
        ],
      },
    ],
  },
};

function LegalDoc({ kind }: { kind: 'privacy' | 'terms' }) {
  const lang = useLang();
  const t = useT();
  const doc = kind === 'privacy' ? PRIVACY[lang] : TERMS[lang];

  useEffect(() => { window.scrollTo(0, 0); }, [kind]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-4 sm:px-5">
          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <LihaiLaBrandLink />
            <span aria-hidden className="h-4 w-px bg-slate-200" />
            <Link href="/welcome" className="shrink-0"><Logo size={25} /></Link>
          </div>
          <nav aria-label="Legal" className="ml-4 hidden items-center gap-4 text-[14px] font-medium text-slate-600 md:flex">
            <Link href="/privacy" className={`transition hover:text-ink ${kind === 'privacy' ? 'font-semibold text-ink' : ''}`}>{t('footer.privacy')}</Link>
            <Link href="/terms" className={`transition hover:text-ink ${kind === 'terms' ? 'font-semibold text-ink' : ''}`}>{t('footer.terms')}</Link>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <LanguageSwitcher compact />
            <Link href="/" onClick={markStarted} className="hidden whitespace-nowrap rounded-full bg-ink px-4 py-2 text-[13.5px] font-semibold text-white shadow-xs transition hover:bg-slate-800 active:scale-[.98] sm:inline-flex">
              {t('land.openApp')}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-20 pt-10 sm:pt-14">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/welcome" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-slate-500 transition hover:text-ink">
            <ArrowLeft size={15} />
            <span>Dissentry</span>
          </Link>
          <div className="inline-flex rounded-full bg-slate-100 p-0.5 text-[12.5px] font-semibold">
            <Link href="/privacy" className={`rounded-full px-3 py-1 transition ${kind === 'privacy' ? 'bg-white text-ink shadow-2xs' : 'text-slate-500 hover:text-ink'}`}>
              {t('footer.privacy')}
            </Link>
            <Link href="/terms" className={`rounded-full px-3 py-1 transition ${kind === 'terms' ? 'bg-white text-ink shadow-2xs' : 'text-slate-500 hover:text-ink'}`}>
              {t('footer.terms')}
            </Link>
          </div>
        </div>

        <div className="mt-6">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/80 px-3 py-1 text-[12px] font-semibold text-amber-900">
            {kind === 'privacy' ? <ShieldCheck size={14} /> : <FileText size={14} />}
            <span>Dissentry · Lihai La LLC</span>
          </span>
          <h1 className="mt-3 text-[34px] font-extrabold tracking-tight text-ink sm:text-[40px]">{doc.title}</h1>
          <p className="mt-1.5 text-[13.5px] text-slate-400">{doc.updated}</p>
        </div>

        <div className="mt-6 rounded-2xl border border-amber-200/80 bg-amber-50/55 px-5 py-4 text-[15px] leading-relaxed text-slate-700">
          {doc.summary}
        </div>

        <div className="mt-8 space-y-7">
          {doc.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-[18px] font-bold tracking-tight text-ink">{s.heading}</h2>
              <div className="mt-2 space-y-2.5 text-[15px] leading-[1.7] text-slate-600">
                {s.body.map((para, i) => <p key={i}>{para}</p>)}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-5 py-4 text-[13.5px] text-slate-600">
          <a
            href={lihailaUrl(lang, kind === 'privacy' ? 'privacy' : 'terms')}
            className="inline-flex items-center gap-1 font-semibold text-ink transition hover:text-sky-700"
          >
            <span>{doc.companyPolicyLabel}</span>
            <ArrowUpRight size={14} />
          </a>
        </div>
      </main>

      <LihaiLaFooter />
    </div>
  );
}

export function PrivacyPage() {
  return <LegalDoc kind="privacy" />;
}

export function TermsPage() {
  return <LegalDoc kind="terms" />;
}
