<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:progress-tracking-rules -->
# PROGRESS.md — 공유 작업 맥락 (필독)

이 프로젝트는 여러 에이전트가 순차적으로 작업합니다. `PROGRESS.md`가 유일한 공유 맥락입니다.

## 작업 시작 시 (필수)
1. `PROGRESS.md`를 **반드시 먼저** 읽어 현재 단계와 이전 작업 내용을 파악한다.
2. 사용자에게 현재 진척 상태를 한 줄로 요약해 보고한 후 작업을 시작한다.

## 작업 완료 시 (필수)
1. 완료된 태스크의 `[ ]`를 `[x]`로 변경한다.
2. 새로 수행한 작업이 있으면 해당 단계에 항목을 추가하고 `[x]` 표시한다.
3. 전체 진척도 퍼센트를 현실에 맞게 갱신한다.
4. `## 📅 업데이트 이력` 섹션에 아래 형식으로 한 줄 추가한다:
   ```
   - **YYYY-MM-DD**: [수행한 작업 내용 한국어 요약]
   ```

> PROGRESS.md를 업데이트하지 않으면 다음 에이전트가 맥락을 잃습니다.
<!-- END:progress-tracking-rules -->
