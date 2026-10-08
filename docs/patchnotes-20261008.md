# 2026-10-08 패치노트 보충 대조표

마지막 등록 항목(v2.5.90, Frontend b344684) 이후 운영 계보의 비병합 커밋과 이번 감사 개선을 날짜(KST)별 9개 묶음으로 추가했다. 병합 커밋은 변경을 중복 집계하지 않는다. 총 58개 작업 커밋을 확인했다. 기존 92개 항목은 유지하며 현재 101개다. 이 표는 커밋 이력의 대조 근거이며 각 중간 버전의 개별 배포 증명은 아니다. 미병합 실험·다른 작업 브랜치를 운영 반영으로 기록하지 않는다.

| 날짜 | 저장소 | 커밋 | 작업 |
|---|---|---|---|
| 2026-10-08 | Frontend | d3b1a5d | fix: align detect handoff and fragment guidance with report policy |
| 2026-10-08 | Frontend | 5f5f14d | fix: separate source input review from result quality guidance |
| 2026-10-08 | Backend | b7cb695 | fix: preserve source boundaries and align audit trace and detect guidance |
| 2026-10-08 | Backend | 143a61b | fix: complete audit quality preservation and operational evidence |
| 2026-10-07 | Backend | 0541981 | Fix cited prose paragraph reflow rollback (v2.5.103) |
| 2026-10-06 | Frontend | c87c90f | feat(admin): show video and campaign signup attribution |
| 2026-10-06 | Frontend | 875bbe0 | feat(admin): separate attribution tab and add UTM link builder |
| 2026-10-06 | Backend | d596898 | feat(admin): aggregate signup attribution from stored users |
| 2026-10-04 | Frontend | fa4b387 | Fix active job recovery and saved-result payment actions |
| 2026-10-04 | Backend | 91d4e29 | Reduce judge cache churn and record complete API costs (v2.5.102) |
| 2026-10-04 | Backend | 90830a4 | Release paragraph recovery as gpt-prod v2.5.101 |
| 2026-10-04 | Backend | 4b3c89f | Fix final paragraph recovery and source-backed word boundaries |
| 2026-10-04 | Backend | 4896b6a | Pause transform completion on insufficient balance and fence cancellation |
| 2026-10-03 | Backend | db36314 | fix(humanize): stabilize cover subtitles and audit delivered layout |
| 2026-10-03 | Backend | a21a58b | fix(humanize): preserve discourse grouping and source-backed phrasing |
| 2026-10-03 | Backend | 91a618f | fix(humanize): refine subtitle and dependent paragraph boundaries |
| 2026-10-03 | Backend | 5aff4e4 | fix(humanize): respect line contracts and distinguish prose indentation |
| 2026-10-02 | Frontend | d010288 | feat(admin-lab): preview result design A on the live workspace |
| 2026-10-02 | Frontend | cba430b | feat(notice): announce humanize incident and planned compensation |
| 2026-10-02 | Frontend | c13ef4e | feat(notice): announce all-member 100-credit compensation |
| 2026-10-02 | Frontend | 88f6282 | fix(detect): align score explanations and saved history presentation |
| 2026-10-02 | Frontend | 85749b7 | feat(result-a): show result design A to every user |
| 2026-10-02 | Frontend | 6a4391c | fix(notice): confirm recovery after successful production jobs |
| 2026-10-02 | Frontend | 5acce39 | style(admin-lab): tune result preview for long text and fix split pairing |
| 2026-10-02 | Frontend | 4ef474a | feat(admin-lab): add side-by-side result preview (design A) |
| 2026-10-02 | Frontend | 435a8f7 | feat(result-a): tokens, mobile layout and meeting items for result design A |
| 2026-10-02 | Frontend | 38b39b6 | content(research): add survey design and percentage writing guides |
| 2026-10-02 | Frontend | 2401aff | fix(admin): hide incident grant rows only in admin ledger |
| 2026-10-02 | Frontend | 06557fa | style(result-a): same type size for original and result on desktop |
| 2026-10-02 | Backend | fe81d1e | wip(audit): preserve tested integrity candidate pending full long-run validation |
| 2026-10-02 | Backend | 99a4289 | fix(humanize): preserve recovered outline boundaries and research topic paragraphs |
| 2026-10-02 | Backend | 70c2697 | fix(admin): read filtered credit ledger through indexes |
| 2026-10-02 | Backend | 29c67e2 | fix: preserve paragraph roles across source repair and classification |
| 2026-10-02 | Backend | 261b56b | fix(detect): enforce score units and preserve evidence and history provenance |
| 2026-10-02 | Backend | 076d4fb | fix(admin): keep compensation grants out of usage ledger view |
| 2026-10-01 | Frontend | 2b5c293 | feat(pricing): show the October autumn event (+10% from 14,500) on charge UI |
| 2026-10-01 | Backend | e0f7f2f | chore(engine): release citation layout preservation v2.5.96 |
| 2026-10-01 | Backend | cf11a2f | feat(pricing): run the October autumn event (+10% from 14,500) |
| 2026-10-01 | Backend | 8bcf37b | fix(engine): preserve source-owned citation and quote layout |
| 2026-10-01 | Backend | 60ab9d0 | fix(deps): patch brace expansion for production release |
| 2026-09-30 | Frontend | 7a6bb16 | content(research): add source search and research methods guides |
| 2026-09-30 | Frontend | 58e3e70 | fix(notices): humanize all existing titles and bodies in formal Korean |
| 2026-09-30 | Frontend | 3f90e65 | feat(admin): replace GPT-6 Sol option with GPT-6.1 Sol |
| 2026-09-30 | Frontend | 1def7c6 | fix(copy): remove the training-use promise from landing and FAQ |
| 2026-09-30 | Backend | d27b832 | feat(ai): upgrade Sol routing to GPT-6.1 Sol |
| 2026-09-30 | Backend | 2df11d4 | fix(engine): check chunk boundary marker order and count marker failures v2.5.95 |
| 2026-09-29 | Frontend | ce6e792 | fix(notifications): open readable details and stabilize operator icon |
| 2026-09-29 | Frontend | a628fdf | style(notifications): widen detail reader for longer messages |
| 2026-09-29 | Frontend | 6da3f76 | fix(notifications): avoid duplicate read writes and size detail actions |
| 2026-09-29 | Frontend | 6a04e48 | feat(notifications): ship realtime operator messages and readable notification UI |
| 2026-09-29 | Frontend | 3d2ec74 | fix(csp): allow Naver static scripts and log endpoint |
| 2026-09-29 | Frontend | 0190840 | feat(notifications): support long messages with preview and full text reader |
| 2026-09-29 | Backend | f8a6452 | fix(engine): protect vertical table cells from prose reflow |
| 2026-09-29 | Backend | c1a2513 | fix(engine): repair verified inline quote word wraps before freezing |
| 2026-09-29 | Backend | 9f89da9 | fix(ops): repair coupon hang and make daily error logs readable |
| 2026-09-29 | Backend | 6a70e9e | fix(engine): keep paragraphs that end without a period v2.5.93 |
| 2026-09-29 | Backend | 1b5eee7 | feat(engine): restore the missing final period of a paragraph v2.5.94 |
| 2026-09-29 | Backend | 0cf6af6 | fix(notifications): preserve long admin messages and reject overflow |

## 배포 작성자 확인 — 2026-10-08

프런트엔드 배포에서 테스트용 작성자 이메일 `test@example.com`을 GitHub 계정과 연결할 수 없어 Vercel이 배포를 차단했다. 사용자에게 Vercel 연결 계정이 `URL2004`임을 확인하고, GitHub CLI 재인증 후 같은 계정의 저장소 관리자 권한을 확인했다. 저장소 로컬 Git 작성자를 확인된 계정의 GitHub noreply 주소로 수정했다.

배포 전에는 `gh api user`, `git config --local user.email`, `git log -1 --format="%an <%ae>"`로 인증 계정과 실제 커밋 작성자를 확인한다. 테스트용 작성자가 남아 있으면 실제 계정을 확인한 뒤 설정을 수정한다. Git 출처를 제거하거나 권한 검사를 해제하지 않는다. 이미 공유된 커밋은 다시 쓰지 않는다.

이 후속 변경은 배포 절차 기록이며 사용자 기능과 패치노트 101개 항목은 변경하지 않는다. 실제 배포 완료 여부는 Vercel 상태와 운영 사이트 응답을 확인한 뒤 판단한다.
