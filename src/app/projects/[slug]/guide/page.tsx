'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useProject } from '../../../../context/ProjectContext';
import {
  FileText, Code, Smartphone, Palette, ShieldCheck, Cpu,
  Check, Trash2, AlertTriangle, Lightbulb, Plus, X, Loader2
} from 'lucide-react';

interface CustomItem {
  id: string;
  text: string;
  detail: string;
}

interface SavedState {
  checked: Record<string, boolean>;
  added: Record<string, CustomItem[]>;
  deleted: Record<string, boolean>;
}

interface PosSection {
  phase: string;
  group?: string;
  items: string[][];
  note?: {
    tone: string;
    title: string;
    body: string;
  };
}

interface PositionData {
  id: string;
  iconName: string;
  name: string;
  fullName: string;
  role: string;
  meta: string;
  sections: PosSection[];
  table?: {
    title: string;
    cols: string[];
    rows: string[][];
  };
  endNotes?: {
    tone: string;
    title: string;
    body: string;
  }[];
}

export default function PositionGuidePage() {
  const params = useParams();
  const projectSlug = (params?.slug as string) || '';
  const { projects } = useProject();

  const currentProject = projects.find(p => p.slug === projectSlug);
  const projectId = currentProject?.id || '';
  const activeProjectName = currentProject?.name || '';

  const LS_KEY = useMemo(() => `etribe_guide_checklist_v2_${projectId}`, [projectId]);

  // UI 상태
  const [activePosIdx, setActivePosIdx] = useState<number>(0);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [added, setAdded] = useState<Record<string, CustomItem[]>>({});
  const [deleted, setDeleted] = useState<Record<string, boolean>>({});
  const [addingKey, setAddingKey] = useState<string | null>(null);
  
  const [draftText, setDraftText] = useState('');
  const [draftDetail, setDraftDetail] = useState('');

  // 1. 포지션별 마스터 데이터 정의
  const POS: PositionData[] = useMemo(() => [
    {
      id: 'pm',
      iconName: 'pm',
      name: 'PM',
      fullName: 'PM · 프로젝트 매니저',
      role: '총괄',
      meta: '전체 일정 관리 · 이해관계자 커뮤니케이션 · 웹와치 창구 · 산출물 취합',
      sections: [
        {
          phase: '착수 전',
          group: '계약 & 범위',
          items: [
            ['심사 범위 확정 후 계약 진행', '웹 페이지 수 / 앱 뷰 수 기준으로 심사 범위 확정'],
            ['심사비 납부 주체 확인', '납부 주체(이트라이브) 여부 확인'],
            ['사이트 소유·운영 기관 정보 수령', '웹와치 신청 시 클라이언트에게 수령'],
          ]
        },
        {
          phase: '착수 전',
          group: '외부 솔루션 사전 식별',
          items: [
            ['자체 수정 불가 외부 솔루션 목록화', '보안 키패드, 외부 결제/인증 iframe, 유튜브 자막, 통합 멤버십 등 전수 조사', 'e'],
            ['외부 솔루션별 접근성 지원 여부 확인', '벤더사에 키보드 접근·대체 수단 제공 가능 여부 문의. 수정 불가 시 마크 획득 불가', 'e'],
          ],
          note: { tone: 'warn', title: '주의', body: '외부 솔루션 협의는 벤더사 응답까지 수 주 걸릴 수 있음. 착수 전에 시작하지 않으면 심사 일정에 직접 영향.' }
        },
        {
          phase: '착수 전',
          group: '개발 환경 사전 신청 및 셋팅',
          items: [
            ['GitLab/GitHub 계정 신청 및 권한 부여', '퍼블리셔·스크립터·개발자별 저장소 접근 권한 목록 작성 후 클라이언트 요청'],
            ['STG 서버 접근 계정 발급', '개발·검증용 환경 접속 정보 수령, VPN/방화벽 신청 병행'],
            ['테스트플라이트 계정 등록', 'iOS 심사용 빌드 수신 계정 전달, 배포 초대 확인까지 완료'],
            ['테스트용 서비스 로그인 계정 생성', '마이페이지·주문·즐겨찾기 등 심사 필요 최소 데이터 사전 세팅'],
            ['클라이언트 측 배포 스케줄 공유 요청', '운영 배포 주기 파악해 수정 반영 타이밍·심사 일정 충돌 사전 조율', 'r'],
            ['모바일 테스트 환경 구축', 'Android USB 원격 디버깅, iOS 실기기 VoiceOver 환경 팀 내 확보'],
          ],
          note: { tone: 'tip', title: '체크포인트', body: '위 항목 중 하나라도 미완료 상태로 개선 작업이 시작되면 코드 반영·검증이 불가. PM이 킥오프 전 완료 여부를 표로 관리 권장.' }
        },
        {
          phase: '착수 전',
          group: '디자인 가이드 및 원본 요청',
          items: [
            ['Figma 원본 파일 Edit 권한 공유 요청', '퍼블리셔·디자이너 계정 전달, 초대 수락 및 접근 확인까지'],
            ['디자인 가이드 문서 수령', '컬러 시스템·타이포그래피·컴포넌트 정의 포함 여부 확인, 미비 시 보완 요청', 'o'],
            ['브랜드 가이드라인 수령', '로고 사용 규칙, 컬러 팔레트(HEX/RGB) 포함 여부 확인'],
            ['아이콘·이미지 에셋 원본 요청', 'SVG(벡터)·PNG(래스터) 구분 수령, 용도별 사이즈 정의 확인'],
          ],
          note: { tone: 'warn', title: '주의', body: 'Figma Edit 권한 없이 작업 시작 시 치수·색상값 확인 불가로 오류 가능성 증가. PNG만 수령 시 확대 품질 저하 — 원본 확보 필요.' }
        },
        {
          phase: '착수 전',
          group: 'WBS 작성',
          items: [
            ['WBS 초안 수립', '사전 진단 → 개선 작업 → 심사 신청(한 달 전) → 1차 심사 → 재심사 → 인증 획득 일정', 'o'],
            ['포지션별 투입 인원 확정', '퍼블리셔·스크립터·개발자·디자이너·QA'],
            ['클라이언트 측 담당 PM 및 실무 창구 확인', ''],
          ]
        },
        {
          phase: '진행 중',
          group: '보고 & 커뮤니케이션',
          items: [
            ['주간 보고 체계 수립', '포지션별 수정 완료 항목 집계 + 이슈 사항 클라이언트 공유', 'o'],
            ['진척 지연 시 사유·만회 가능성 함께 브리핑', '단순 수치 보고 금지'],
            ['내부 이슈 에스컬레이션 기준 사전 정의', ''],
          ]
        },
        {
          phase: '진행 중',
          group: '이슈 관리',
          items: [
            ['외부 솔루션 벤더사 협의 진행 상황 추적', '응답 지연 시 클라이언트 에스컬레이션', 'e'],
            ['배포 일정과 수정 완료 시점 싱크 관리', '배포 누락 시 재심사 위험', 'r'],
            ['이슈 로그 별도 관리', '발견 → 담당자 배분 → 수정 확인 흐름', 'o'],
          ]
        },
        {
          phase: '진행 중',
          group: '디자인 & 협업',
          items: [
            ['디자인 가이드 및 Figma Edit 권한 초반 수령', '미수령 시 즉시 재요청'],
            ['디자이너-퍼블리셔 간 피드백 루프 조율', 'PM이 중간 창구'],
          ]
        },
        {
          phase: '심사',
          group: '심사 신청',
          items: [
            ['웹와치 심사 방식 최종 협의', '원격/파견, 앱 배포 방식(APK/테스트플라이트) 확인 (심사 한 달 전)'],
            ['웹와치 심사 신청', '웹/앱 각각 별도 신청, 심사 한 달 전 신청 목표'],
            ['심사용 계정 별도 생성 요청', '로그인 필요 서비스'],
            ['웹와치 담당자 연락 채널 확보', ''],
          ]
        },
        {
          phase: '심사',
          group: '심사 후 대응',
          items: [
            ['1차 심사 리포트 지적 항목 포지션별 배분', '', 'o'],
            ['재심사 일정(약 1주) 역산해 수정 마감 설정', '', 'r'],
            ['재심사 전 수정 항목 전수 확인', 'QA와 교차 확인'],
          ]
        },
        {
          phase: '완료 후',
          group: '산출물 정리',
          items: [
            ['완료 보고서 작성', 'AS-IS/TO-BE 개선 사례, 항목별 개선율, 인증 마크 3종 취득 결과', 'o'],
            ['인수인계 문서 작성', '사용자 매뉴얼 / 디자인 가이드 등', 'o'],
            ['산출물 목록 상급자 검토 → 승인 후 전달', '내부 검토 → 클라이언트 PM 전달 (순서 준수)'],
          ]
        },
        {
          phase: '완료 후',
          group: '클라이언트 인계',
          items: [
            ['인증 마크 게시 위치 및 갱신 일정 안내', ''],
          ]
        },
      ],
      table: {
        title: '주요 관리 포인트',
        cols: ['항목', '내용'],
        rows: [
          ['심사 일정 리스크', '앱 심사는 마켓 배포 승인 시간 포함. STG 또는 APK/테스트플라이트 방식 사전 합의. 온라인 심사 불가 시 파견 심사로 전환.'],
          ['배포 스케줄 충돌 방지', '클라이언트 운영 배포 주기를 착수 전에 파악, 접근성 수정 반영 타이밍과 심사 일정 충돌 방지.'],
          ['외부 솔루션 리스크', '수정 불가 영역은 심사 전까지 벤더사 대응 완료 여부 추적. 미해결 시 클라이언트와 리스크 공유 필수.'],
          ['산출물 목록', 'WBS, 사전진단 리포트, 주간현황, 완료보고서(PPTX), 사용자 매뉴얼, 디자인 가이드']
        ]
      }
    },
    {
      id: 'pub',
      iconName: 'pub',
      name: '퍼블리셔',
      fullName: '퍼블리셔',
      role: 'HTML / ARIA',
      meta: 'HTML 구조 · WAI-ARIA 마크업 · 스크린리더 호환 · 포커스 처리',
      sections: [
        {
          phase: '착수 전',
          items: [
            ['마크업 수정 항목 목록화', '사전 진단 결과 기반, 웹(PC/모바일) 페이지별 이슈 매핑'],
            ['Figma Edit 권한 수령 확인', '치수·색상값·컴포넌트 구조 직접 확인 가능 여부 접근 테스트'],
          ]
        },
        {
          phase: '진행 중',
          items: [
            ['대체 텍스트(alt) 작성', '의미 있는 이미지·아이콘 전수 검토, 장식 이미지는 alt="" 처리'],
            ['페이지 title 태그 정비', '형식: 현재페이지 > Depth | 서비스명'],
            ['heading 구조 정비', 'h1~h6 계층 논리 순서, 모바일 웹 heading role 누락 점검'],
            ['WAI-ARIA 적용', '탭(tablist/tab/tabpanel), 아코디언(aria-expanded), 모달(dialog/aria-modal), 알림(aria-live)'],
            ['포커스 가시성 확보', '포커스 테두리가 클릭 영역 기준 표시되도록 display:block 또는 flex 적용'],
            ['aria-hidden 적용 관리', '장식 아이콘·이미지 처리, aria-hidden 요소로 포커스 이동 차단 확인'],
            ['오류 메시지 연결', '폼 오류 시 aria-describedby로 오류 메시지·입력 필드 명시적 연결'],
          ]
        },
        {
          phase: '심사',
          items: [
            ['심사 지적 항목 중 마크업 관련 수정', '재심사 일정 내 완료'],
          ]
        },
        {
          phase: '완료 후',
          items: [
            ['수정 내역 가이드 문서화', '퍼블리싱 표준 가이드에 접근성 마크업 규칙 반영'],
          ]
        }
      ]
    },
    {
      id: 'scr',
      iconName: 'scr',
      name: '스크립터',
      fullName: '스크립터',
      role: 'Dynamic ARIA',
      meta: '동적 ARIA 처리 · 키보드 인터랙션 · 스크린리더 상태 알림 · DOM 변경 감지',
      sections: [
        {
          phase: '착수 전',
          items: [
            ['동적 콘텐츠 목록화', 'AJAX 갱신, 레이어 팝업, 탭 전환, 슬라이더 등 JS 의존 UI 전수 조사'],
          ]
        },
        {
          phase: '진행 중',
          items: [
            ['탭 컴포넌트 키보드 인터랙션', '좌우 화살표 이동, Home/End 지원, 포커스·활성화 동시 처리'],
            ['AJAX 콜백 타이밍 처리', '상태 속성(aria-selected)은 AJAX 완료 전 먼저 변경 후 요청 (발화 타이밍 확보)'],
            ['aria-live 영역 운용', '동적 상태 변화 시 polite/assertive 적절히 선택'],
            ['MutationObserver 패턴', '동적 DOM 교체로 ARIA 속성 초기화 시 옵저버로 재적용'],
            ['모바일 고정 하단바 가림 이슈', 'input focusin 시 스크롤 보정 (iOS: setInterval, Android: scroll debounce)'],
            ['jQuery UI 탭 위젯 ARIA 수정', 'aria-expanded 자동 주입 문제, role/tabIndex 수동 제어'],
            ['슬라이더 aria-current 과다 발화 방지', 'autoplay 중 페이지네이션 불릿 갱신 주기 조절'],
          ]
        },
        {
          phase: '심사',
          items: [
            ['심사 지적 항목 중 스크립트 수정', '재심사 일정 내 완료 및 스크린리더 재검증'],
          ]
        },
        {
          phase: '완료 후',
          items: [
            ['접근성 JS 패턴 내부 문서화', '재사용 가능한 컴포넌트 init() 함수로 정리'],
          ]
        }
      ],
      endNotes: [{ tone: 'tip', title: '스크린리더 환경 확인 필수', body: 'NVDA+Chrome(Win), VoiceOver(iOS/macOS), TalkBack(Android), 센스리더(Win) — 동일 마크업도 발화 방식이 달라 다중 환경 검증 필수.' }]
    },
    {
      id: 'dev',
      iconName: 'dev',
      name: '개발자',
      fullName: '개발자',
      role: 'iOS / Android',
      meta: 'iOS/Android 앱 접근성 · 네이티브 role 설정 · WebView 이슈 · 심사용 빌드 관리',
      sections: [
        {
          phase: '착수 전',
          items: [
            ['앱 심사 전달 방식 결정', 'Android: APK 직접 전달 / iOS: 테스트플라이트 계정 발급·전달'],
            ['심사 서버 환경 확인', 'STG/운영 중 심사 대상 버전 명확히 결정 후 웹와치 안내'],
          ]
        },
        {
          phase: '진행 중',
          items: [
            ['iOS 헤딩 role 적용', 'accessibilityTraits(.header) 또는 accessibilityHeading 설정'],
            ['Android TalkBack 포커스 박스 오프셋 이슈', 'WebView 좌표 불일치 시 네이티브 ViewCompat 설정 검토'],
            ['앱 튜토리얼·설치 화면 접근성', '설치 가이드, QR 영역 대체 텍스트·role 설정'],
            ['외부 보안 모듈 접근성 협의', '벤더사와 키보드 접근·대체 수단 제공 여부 확인 (PM과 병행)', 'e'],
            ['reCAPTCHA 방화벽 이슈', 'www.recaptcha.net 도메인으로 프론트·백엔드 통일 적용 검토'],
          ]
        },
        {
          phase: '심사',
          items: [
            ['심사용 APK / 테스트플라이트 빌드 제출', '마켓 배포 일정과 분리해 심사 전용 버전 별도 관리'],
            ['심사 지적 사항 중 네이티브 앱 영역 수정', '재심사 빌드 재제출'],
          ]
        },
        {
          phase: '완료 후',
          items: [
            ['인증 마크 앱 내 게시', '접근성 정책 페이지 또는 앱 정보 화면에 마크 노출'],
          ]
        }
      ],
      endNotes: [{ tone: 'warn', title: '앱 배포 일정 주의', body: '운영 앱 배포 스케줄과 심사 일정이 충돌하지 않도록 사전 조율. 마켓 승인 지연 시 심사 일정 전체가 밀릴 수 있음.' }]
    },
    {
      id: 'des',
      iconName: 'des',
      name: '디자이너',
      fullName: '디자이너',
      role: '명도대비 / 포커스',
      meta: '명도대비 · 색상 독립 인식 · 포커스 라인 · 접근성 디자인 가이드',
      sections: [
        {
          phase: '착수 전',
          items: [
            ['Figma Edit 권한으로 공유', '퍼블리셔 계정 초대 후 접근 가능 여부 확인'],
            ['디자인 가이드 문서 전달', '컬러 시스템(HEX/RGB), 타이포그래피, 컴포넌트 정의 포함', 'o'],
            ['브랜드 가이드라인 전달', '로고 사용 규칙, 컬러 팔레트 공유'],
            ['아이콘·이미지 에셋 원본 전달', 'SVG·PNG 구분, 용도별 사이즈 정의 포함'],
            ['사전 진단 리포트 내 디자인 항목 파악', '명도대비 미달, 색상 단독 정보 전달, 포커스 라인 부재 유형 분류'],
          ]
        },
        {
          phase: '진행 중',
          items: [
            ['명도대비 기준 충족 색상 수정', '일반 4.5:1, 확대 지원 시 3:1. 브랜드 컬러 미달 시 유사 색상 대안 검토'],
            ['색상 독립 인식', '색상 외 형태·텍스트·패턴 등 추가 시각 단서 병행 제공'],
            ['포커스 라인 디자인', '명확한 아웃라인 스타일 정의 및 Figma 반영'],
            ['Figma 피드백 루프', '수정 요청 → 기준 충족 수정안 → PNG/파일 재공유 (PNG 권장)'],
          ]
        },
        {
          phase: '완료 후',
          items: [
            ['접근성 디자인 가이드 문서화', '색상 팔레트, 명도대비 표, 포커스 스타일 기준 포함', 'o'],
          ]
        }
      ],
      table: {
        title: '명도대비 기준',
        cols: ['유형', '기준'],
        rows: [
          ['일반 텍스트', '4.5:1 이상'],
          ['디바이스 확대 기능 지원 시', '3:1 이상'],
          ['큰 텍스트 (18pt+ / 14pt bold+)', '3:1 이상']
        ]
      },
      endNotes: [{ tone: 'tip', title: '브랜드 컬러 협의', body: '노란색 등 브랜드 컬러가 명도대비 기준 미달인 경우, 기준 충족 시 주황색 계열로 변경될 수 있어 브랜드팀 사전 협의 권장.' }]
    },
    {
      id: 'qa',
      iconName: 'qa',
      name: 'QA',
      fullName: 'QA',
      role: '검증 / 다중 환경',
      meta: '스크린리더 검증 · 키보드 탐색 · 다중 환경 테스트 · 심사 전 사전 점검',
      sections: [
        {
          phase: '착수 전',
          items: [
            ['테스트 환경 세팅', 'NVDA+Chrome, VoiceOver+Safari, TalkBack, 센스리더 설치 및 USB 원격 디버깅 구성'],
            ['심사 체크리스트 작성', 'KWCAG 2.2 기반, 웹/iOS/Android 플랫폼별 테스트 시나리오 수립', 'o'],
          ]
        },
        {
          phase: '진행 중',
          items: [
            ['키보드 단독 탐색 검증', 'Tab, Shift+Tab, Enter, Space, 화살표키로 모든 기능 접근 가능 확인'],
            ['스크린리더 발화 검증', '대체 텍스트·역할·상태값(선택·확장·오류) 다중 환경 확인'],
            ['명도대비 측정', '개발자도구/전용 도구로 수정 색상 기준 충족 수치 확인'],
            ['포커스 이동 순서 검증', '논리 순서, 모달 열림 시 포커스 이동·닫힘 시 원래 위치 복귀 확인'],
            ['동적 콘텐츠 검증', 'AJAX 후 aria-live 발화, 탭 전환 시 aria-selected 즉시 반영 확인'],
          ]
        },
        {
          phase: '심사 전',
          items: [
            ['심사 전 사전 점검', '웹와치 실제 테스트 시나리오 기준 전수 재검토, 미완 항목 PM 즉시 보고'],
          ]
        },
        {
          phase: '심사',
          items: [
            ['1차 심사 리포트 분석', '지적 항목 유형 분류 후 포지션별 배분 지원'],
          ]
        },
        {
          phase: '완료 후',
          items: [
            ['테스트 결과 문서 정리', '환경별 이슈 목록, 해결 방법, 잔여 이슈(범위 외) 명시', 'o'],
          ]
        }
      ],
      table: {
        title: '테스트 환경 매트릭스',
        cols: ['플랫폼', '도구'],
        rows: [
          ['웹 (PC/모바일)', 'NVDA + Chrome, VoiceOver + Safari, 센스리더 + Chrome, 키보드 단독'],
          ['iOS 앱', 'VoiceOver (실기기), 테스트플라이트 빌드, 스위치 제어'],
          ['Android 앱', 'TalkBack (실기기), USB 원격 디버깅, APK 빌드'],
          ['공통 측정 도구', 'Chrome 접근성 탭, 명도대비 측정기, Accessibility Insights']
        ]
      }
    }
  ], [projectId]);

  // 기본 시딩 체크 이력
  const SEED: Record<string, number[]> = {
    pm: [0, 1, 2, 3, 5, 6, 8],
    pub: [0, 1, 2, 3],
    scr: [0, 1, 2],
    dev: [0, 1, 2],
    des: [0, 1, 2, 3, 4, 5],
    qa: [0, 1, 2, 3],
  };

  // 2. 초기 로컬 스토리지 로드
  useEffect(() => {
    if (!projectId) return;

    let saved: SavedState | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    } catch (e) {
      console.error('Failed to parse saved guide checklist:', e);
    }

    if (saved) {
      setChecked(saved.checked || {});
      setAdded(saved.added || {});
      setDeleted(saved.deleted || {});
    } else {
      // 첫 로딩 시에는 SEED 데이터를 기본으로 제공
      const initialChecked: Record<string, boolean> = {};
      POS.forEach(p => {
        let globalIndex = 0;
        const seedIndices = SEED[p.id] || [];
        p.sections.forEach((sec, sIdx) => {
          const items = sec.items || [];
          items.forEach((_, iIdx) => {
            if (seedIndices.includes(globalIndex)) {
              initialChecked[`${p.id}#${sIdx}#s${iIdx}`] = true;
            }
            globalIndex++;
          });
        });
      });
      setChecked(initialChecked);
      setAdded({});
      setDeleted({});
    }
  }, [LS_KEY, POS]);

  // 3. 로컬스토리지 영구 보존
  const persist = useCallback((nextChecked: Record<string, boolean>, nextAdded: Record<string, CustomItem[]>, nextDeleted: Record<string, boolean>) => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ checked: nextChecked, added: nextAdded, deleted: nextDeleted })
      );
    } catch (e) {
      console.error('Failed to persist guide state:', e);
    }
  }, [LS_KEY]);

  // 4. 아이콘 매핑 헬퍼
  const getIcon = (iconName: string, className = "w-5 h-5") => {
    switch (iconName) {
      case 'pm': return <ShieldCheck className={className} />;
      case 'pub': return <Code className={className} />;
      case 'scr': return <Cpu className={className} />;
      case 'dev': return <Smartphone className={className} />;
      case 'des': return <Palette className={className} />;
      case 'qa': return <FileText className={className} />;
      default: return <FileText className={className} />;
    }
  };

  // 5. 색상 테마 매핑 헬퍼
  const getIconTheme = (posId: string) => {
    const themeMap: Record<string, { bg: string; color: string; border: string }> = {
      pm:  { bg: '#eef4ff', color: '#2563eb', border: '#c2d3f2' },
      pub: { bg: '#f1ecff', color: '#7c4dff', border: '#decffc' },
      scr: { bg: '#e3f6f1', color: '#0d8a72', border: '#bcdfd5' },
      dev: { bg: '#eaf1ff', color: '#2f6bed', border: '#cad7f6' },
      des: { bg: '#fdf3e2', color: '#c47e10', border: '#eedcb8' },
      qa:  { bg: '#e6f6ee', color: '#178055', border: '#bde7cd' },
    };
    return themeMap[posId] || themeMap.pm;
  };

  // 태그 정보 매핑
  const tagMap: Record<string, { label: string; color: string; bg: string }> = {
    r: { label: '리스크', color: '#c47e10', bg: '#fdf3e2' },
    o: { label: '산출물', color: '#2563eb', bg: '#eaf1ff' },
    e: { label: '외부 협의', color: '#7c4dff', bg: '#f1ecff' },
  };

  // 6. 특정 포지션 및 섹션의 아이템 목록 도출 (SEED에서 삭제된 것 제외 + 커스텀 추가)
  const getSectionItems = useCallback((posId: string, sIdx: number, originalItems: string[][]) => {
    const key = `${posId}#${sIdx}`;
    const output: { id: string; text: string; detail: string; tagCode: string; isCustom: boolean }[] = [];

    // 원본 아이템 중 삭제되지 않은 것
    originalItems.forEach((it, iIdx) => {
      const uId = `${key}#s${iIdx}`;
      if (deleted[uId]) return;
      output.push({
        id: uId,
        text: it[0],
        detail: it[1] || '',
        tagCode: it[2] || '',
        isCustom: false
      });
    });

    // 사용자가 커스텀 추가한 아이템
    (added[key] || []).forEach(custom => {
      output.push({
        id: custom.id,
        text: custom.text,
        detail: custom.detail,
        tagCode: '',
        isCustom: true
      });
    });

    return output;
  }, [added, deleted]);

  // 7. 포지션별 전체 완료 지표 계산
  const getPosStats = useCallback((pos: typeof POS[number]) => {
    let total = 0;
    let done = 0;

    pos.sections.forEach((sec, sIdx) => {
      const items = getSectionItems(pos.id, sIdx, sec.items || []);
      items.forEach(item => {
        total++;
        if (checked[item.id]) done++;
      });
    });

    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [checked, getSectionItems]);

  // 8. 체크 토글 핸들러
  const handleToggleItem = (itemId: string) => {
    const nextChecked = { ...checked };
    if (nextChecked[itemId]) {
      delete nextChecked[itemId];
    } else {
      nextChecked[itemId] = true;
    }
    setChecked(nextChecked);
    persist(nextChecked, added, deleted);
  };

  // 9. 아이템 삭제 핸들러
  const handleRemoveItem = (itemId: string, key: string, isCustom: boolean) => {
    const nextChecked = { ...checked };
    delete nextChecked[itemId];

    let nextAdded = { ...added };
    let nextDeleted = { ...deleted };

    if (isCustom) {
      nextAdded[key] = (nextAdded[key] || []).filter(c => c.id !== itemId);
    } else {
      nextDeleted[itemId] = true;
    }

    setChecked(nextChecked);
    setAdded(nextAdded);
    setDeleted(nextDeleted);
    persist(nextChecked, nextAdded, nextDeleted);
  };

  // 10. 아이템 추가 핸들러
  const handleAddItem = (key: string) => {
    const text = draftText.trim();
    if (!text) return;

    const newItem: CustomItem = {
      id: `${key}#c${Date.now()}`,
      text,
      detail: draftDetail.trim()
    };

    const nextAdded = { ...added };
    nextAdded[key] = (nextAdded[key] || []).concat([newItem]);

    setAdded(nextAdded);
    setAddingKey(null);
    setDraftText('');
    setDraftDetail('');
    persist(checked, nextAdded, deleted);
  };

  // 현재 활성화된 포지션 정보
  const currentPos = POS[activePosIdx];
  const curPosStats = useMemo(() => getPosStats(currentPos), [currentPos, getPosStats]);
  const curPosTheme = getIconTheme(currentPos.id);

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4 text-[#8b95a1]">
        <Loader2 className="w-8 h-8 text-[#3182f6] animate-spin" />
        <span className="text-xs">프로젝트를 읽어오고 있습니다...</span>
      </div>
    );
  }

  return (
    <section className="animate-fade-in flex flex-col h-full overflow-hidden" style={{ minHeight: 0 }}>
      {/* Top Header */}
      <div className="flex justify-between items-center pb-4 border-b border-[#e8ecf3] shrink-0">
        <div>
          <h2 className="text-lg font-bold font-heading text-[#101727]">포지션별 가이드</h2>
          <p className="text-xs mt-0.5 text-[#8a93a6]">
            KWCAG 2.2 · 웹와치 인증 표준 가이드라인 · {activeProjectName}
          </p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Position Selection Rail */}
        <div className="w-[245px] shrink-0 bg-[#fbfcfe] border-r border-[#e8ecf3] overflow-y-auto p-4 flex flex-col gap-3">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#a3abbb] px-1 select-none">포지션 선택</div>
          <div className="flex flex-col gap-2.5">
            {POS.map((p, idx) => {
              const active = idx === activePosIdx;
              const stats = getPosStats(p);
              const th = getIconTheme(p.id);
              
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setActivePosIdx(idx);
                    setAddingKey(null);
                  }}
                  className="w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex gap-2.5 focus:outline-none"
                  style={{
                    backgroundColor: active ? '#ffffff' : 'transparent',
                    borderColor: active ? th.border : '#eef1f6',
                    boxShadow: active ? '0 4px 12px rgba(28, 40, 64, 0.05)' : 'none',
                  }}
                >
                  <div
                    className="w-[34px] h-[34px] rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: th.bg, color: th.color }}
                  >
                    {getIcon(p.iconName, "w-4.5 h-4.5")}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[12.5px] font-extrabold truncate" style={{ color: active ? '#101727' : '#4e5968' }}>
                        {p.name}
                      </span>
                      <span className="text-[10px] font-extrabold" style={{ color: stats.pct === 100 ? '#22a06b' : '#2563eb' }}>
                        {stats.pct}%
                      </span>
                    </div>

                    {/* Mini progress bar */}
                    <div className="h-1 bg-[#eaedf3] rounded-full overflow-hidden mt-1.5 shrink-0">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${stats.pct}%`,
                          backgroundColor: stats.pct === 100 ? '#22a06b' : '#2563eb'
                        }}
                      ></div>
                    </div>
                    <div className="text-[10px] text-[#9aa2b3] font-semibold mt-1">
                      {stats.done}/{stats.total} 완료
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Tag Legend inside Rail */}
          <div className="mt-4 p-3 bg-white border border-[#e8ecf3] rounded-xl select-none shrink-0">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#a3abbb] mb-2">태그 설명</div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[9.5px] font-bold text-[#c47e10] bg-[#fdf3e2] px-1.5 py-0.5 rounded">리스크</span>
                <span className="text-[10px] text-[#8a93a6] font-medium leading-none">일정·비용 영향</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9.5px] font-bold text-[#2563eb] bg-[#eaf1ff] px-1.5 py-0.5 rounded">산출물</span>
                <span className="text-[10px] text-[#8a93a6] font-medium leading-none">문서 산출 필요</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9.5px] font-bold text-[#7c4dff] bg-[#f1ecff] px-1.5 py-0.5 rounded">외부 협의</span>
                <span className="text-[10px] text-[#8a93a6] font-medium leading-none">솔루션사 조율</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          <div className="max-w-[850px] mx-auto space-y-6">
            
            {/* Position Details Header */}
            <div className="flex items-start gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: curPosTheme.bg, color: curPosTheme.color }}
              >
                {getIcon(currentPos.iconName, "w-6 h-6")}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-extrabold text-[#101727] tracking-tight">{currentPos.fullName}</h1>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#eef4ff] text-[#2563eb]">
                    {currentPos.role}
                  </span>
                </div>
                <p className="text-[12.5px] text-[#6b7488] font-medium mt-1 leading-relaxed">{currentPos.meta}</p>
              </div>
            </div>

            {/* Overall progress indicator for current role */}
            <div className="flex items-center gap-4 p-4 border border-[#e8ecf3] rounded-xl shadow-sm">
              <span className="text-[12.5px] font-bold text-[#3a4358] shrink-0 select-none">작업 진행률</span>
              <div className="flex-1 h-2 bg-[#eef0f5] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#3b82f6] to-[#2563eb] rounded-full transition-all duration-500"
                  style={{ width: `${curPosStats.pct}%` }}
                ></div>
              </div>
              <span className="text-[13px] font-bold text-[#2563eb] w-10 text-right shrink-0">{curPosStats.pct}%</span>
              <span className="text-[12px] text-[#8a93a6] font-semibold shrink-0 select-none">
                {curPosStats.done} / {curPosStats.total} 완료
              </span>
            </div>

            {/* Checklists Sections */}
            <div className="space-y-5">
              {currentPos.sections.map((sec, sIdx) => {
                const items = getSectionItems(currentPos.id, sIdx, sec.items || []);
                const key = `${currentPos.id}#${sIdx}`;
                const isAdding = addingKey === key;

                // note 스타일링 결정 함수
                const getNoteTheme = (tone?: string) => {
                  if (tone === 'warn') return {
                    bg: '#fff8ec', border: '#f7e3c2', text: '#c47e10', icon: <AlertTriangle className="w-4 h-4 text-[#c47e10]" />
                  };
                  return {
                    bg: '#eef4ff', border: '#d3def5', text: '#2563eb', icon: <Lightbulb className="w-4 h-4 text-[#2563eb]" />
                  };
                };

                return (
                  <div key={sIdx} className="space-y-2.5">
                    {/* Phase & Group Header */}
                    <div className="flex items-center gap-2 mt-4 select-none">
                      <span className="text-[10px] font-extrabold text-white px-2.5 py-0.5 rounded-md bg-[#5a6478]">
                        {sec.phase}
                      </span>
                      {sec.group && (
                        <span className="text-[12.5px] font-extrabold text-[#22304a] ml-1">{sec.group}</span>
                      )}
                      <div className="flex-1 h-[1px] bg-[#e8ecf3] ml-2"></div>
                    </div>

                    {/* Section Note Callout if exists */}
                    {sec.note && (() => {
                      const nt = getNoteTheme(sec.note.tone);
                      return (
                        <div
                          className="flex gap-2.5 p-3.5 border-l-[3px] rounded-r-xl border-y border-r text-xs leading-relaxed transition-all"
                          style={{ backgroundColor: nt.bg, borderColor: nt.border, borderLeftColor: nt.text }}
                        >
                          <div className="shrink-0 mt-0.5">{nt.icon}</div>
                          <div>
                            <div className="font-extrabold mb-0.5" style={{ color: nt.text }}>{sec.note.title}</div>
                            <div className="text-[#5a6478] font-medium leading-relaxed">{sec.note.body}</div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Section Items Cards List */}
                    <div className="space-y-2">
                      {items.map((item) => {
                        const isChecked = !!checked[item.id];
                        const tag = tagMap[item.tagCode];

                        return (
                          <div
                            key={item.id}
                            className={`flex items-start gap-3 p-3.5 border rounded-xl transition-all ${
                              isChecked ? 'bg-[#f6faf7] border-[#dcecdf] shadow-none' : 'bg-white border-[#e8ecf3] hover:border-[#c2cee4] hover:shadow-sm'
                            }`}
                          >
                            {/* Checkbox */}
                            <button
                              onClick={() => handleToggleItem(item.id)}
                              className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 cursor-pointer focus:outline-none transition-colors ${
                                isChecked ? 'bg-[#22a06b] border-[#22a06b]' : 'bg-white border-[#cdd4e0]'
                              }`}
                            >
                              {isChecked && <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />}
                            </button>

                            {/* Label Content */}
                            <div className="flex-1 min-w-0" onClick={() => handleToggleItem(item.id)}>
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`text-[13.5px] font-bold cursor-pointer select-none truncate ${
                                    isChecked ? 'text-[#8a93a6] line-through' : 'text-[#22304a]'
                                  }`}
                                >
                                  {item.text}
                                </span>
                                {item.isCustom && (
                                  <span className="text-[9.5px] font-bold text-[#0d8a72] bg-[#e3f6f1] px-1.5 py-0.5 rounded">
                                    추가됨
                                  </span>
                                )}
                                {tag && (
                                  <span
                                    style={{ color: tag.color, backgroundColor: tag.bg }}
                                    className="text-[9.5px] font-extrabold px-1.5 py-0.5 rounded"
                                  >
                                    {tag.label}
                                  </span>
                                )}
                              </div>
                              {item.detail && (
                                <p
                                  className={`text-[12px] mt-0.5 leading-relaxed font-medium select-none cursor-pointer ${
                                    isChecked ? 'text-[#aab1bf]' : 'text-[#6b7488]'
                                  }`}
                                >
                                  {item.detail}
                                </p>
                              )}
                            </div>

                            {/* Remove button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveItem(item.id, key, item.isCustom);
                              }}
                              title="항목 삭제"
                              className="shrink-0 w-6.5 h-6.5 border-none bg-transparent rounded-md cursor-pointer flex items-center justify-center text-[#b6bdca] hover:bg-[#fdeaee] hover:text-[#d11d44] transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}

                      {/* Item Adding Form Block */}
                      {isAdding ? (
                        <div className="flex flex-col gap-2.5 p-4 bg-[#f5f8ff] border border-[#c2d3f2] rounded-xl animate-fade-in">
                          <input
                            type="text"
                            placeholder="새 체크 가이드 내용 입력..."
                            value={draftText}
                            onChange={(e) => setDraftText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddItem(key);
                              else if (e.key === 'Escape') setAddingKey(null);
                            }}
                            autoFocus
                            className="w-full bg-white border border-[#d8dee9] rounded-lg px-3 py-2 text-xs font-semibold text-[#22304a] outline-none focus:border-[#2563eb]"
                          />
                          <input
                            type="text"
                            placeholder="설명 문구 추가 (선택)"
                            value={draftDetail}
                            onChange={(e) => setDraftDetail(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddItem(key);
                              else if (e.key === 'Escape') setAddingKey(null);
                            }}
                            className="w-full bg-white border border-[#e2e7f0] rounded-lg px-3 py-2 text-xs font-semibold text-[#5a6478] outline-none focus:border-[#2563eb]"
                          />
                          <div className="flex items-center gap-2 select-none">
                            <button
                              onClick={() => handleAddItem(key)}
                              className="px-3.5 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
                            >
                              추가
                            </button>
                            <button
                              onClick={() => {
                                setAddingKey(null);
                                setDraftText('');
                                setDraftDetail('');
                              }}
                              className="px-3 py-1.5 bg-white border border-[#d8dee9] text-[#6b7488] text-xs font-bold rounded-lg cursor-pointer hover:bg-[#f4f6fa] transition-colors"
                            >
                              취소
                            </button>
                            <span className="text-[10px] text-[#9aa2b3] font-semibold ml-auto">
                              Enter로 추가 / Esc로 취소
                            </span>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingKey(key)}
                          className="w-full py-2.5 bg-transparent border-[1.5px] border-dashed border-[#cdd6e4] rounded-xl cursor-pointer font-bold text-xs text-[#7b8499] flex items-center justify-center gap-1.5 hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-[#f8faff] transition-all"
                        >
                          <Plus className="w-4 h-4" /> 항목 추가
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Position Summary Table if exists */}
            {currentPos.table && (
              <div className="space-y-2 mt-6 animate-fade-in select-none">
                <h3 className="text-[13.5px] font-extrabold text-[#22304a]">{currentPos.table.title}</h3>
                <div className="border border-[#e8ecf3] rounded-xl overflow-hidden shadow-sm">
                  <div className="grid grid-cols-[180px_1fr] bg-[#fafbfd] border-b border-[#eef1f6]">
                    {currentPos.table.cols.map((col, idx) => (
                      <div key={idx} className="p-3 text-[11px] font-extrabold text-[#8a93a6] tracking-wider uppercase">
                        {col}
                      </div>
                    ))}
                  </div>
                  <div className="divide-y divide-[#f1f3f8]">
                    {currentPos.table.rows.map((row, idx) => (
                      <div key={idx} className="grid grid-cols-[180px_1fr] text-xs leading-relaxed bg-white">
                        <div className="p-3.5 font-bold text-[#22304a] border-r border-[#f1f3f8] bg-[#fdfefe]">
                          {row[0]}
                        </div>
                        <div className="p-3.5 text-[#5a6478] font-medium leading-relaxed">
                          {row[1]}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Bottom EndNotes Callouts if exist */}
            {currentPos.endNotes && (
              <div className="space-y-2.5 mt-5">
                {currentPos.endNotes.map((note, idx) => {
                  const toneWarn = note.tone === 'warn';
                  return (
                    <div
                      key={idx}
                      className="flex gap-2.5 p-3.5 border-l-[3px] rounded-r-xl border-y border-r text-xs leading-relaxed"
                      style={{
                        backgroundColor: toneWarn ? '#fff8ec' : '#eef4ff',
                        borderColor: toneWarn ? '#f7e3c2' : '#d3def5',
                        borderLeftColor: toneWarn ? '#c47e10' : '#2563eb',
                      }}
                    >
                      <div className="shrink-0 mt-0.5">
                        {toneWarn ? (
                          <AlertTriangle className="w-4 h-4 text-[#c47e10]" />
                        ) : (
                          <Lightbulb className="w-4 h-4 text-[#2563eb]" />
                        )}
                      </div>
                      <div>
                        <div className="font-extrabold mb-0.5" style={{ color: toneWarn ? '#c47e10' : '#2563eb' }}>
                          {note.title}
                        </div>
                        <p className="text-[#5a6478] font-medium leading-relaxed">{note.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        </div>
      </div>
    </section>
  );
}
