'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function ApiDocsPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Load CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css';
    document.head.appendChild(link);

    // 2. Load JS Bundle
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js';
    script.async = true;
    script.onload = () => {
      // 3. Initialize Swagger UI once loaded
      // @ts-ignore
      window.ui = window.SwaggerUIBundle({
        dom_id: '#swagger-ui',
        spec: openApiSpec,
        deepLinking: true,
        presets: [
          // @ts-ignore
          window.SwaggerUIBundle.presets.apis,
          // @ts-ignore
          window.SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: 'BaseLayout'
      });
      setLoading(false);
    };
    document.body.appendChild(script);

    return () => {
      document.head.removeChild(link);
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div className="bg-white min-h-screen p-4 sm:p-8">
      <div className="max-w-6xl mx-auto bg-white rounded-2xl border border-[#e5e8eb] shadow-sm p-6">
        <h1 className="text-xl font-bold mb-4 text-[#191f28]">API 문서 (Swagger UI)</h1>
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-[#8b95a1]">
            <Loader2 className="w-8 h-8 text-[#3182f6] animate-spin" />
            <span className="text-xs font-semibold">Swagger UI를 로드하고 있습니다...</span>
          </div>
        )}
        <div id="swagger-ui" className={loading ? 'hidden' : 'block'} />
      </div>
    </div>
  );
}

// Swagger OpenAPI Specification
const openApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "웹 접근성 인증 프로젝트 PM 툴 API 명세",
    version: "1.0.0",
    description: "구글 시트 연동 및 사용자 권한 관리 등을 위해 제공되는 백엔드 API 명세서입니다."
  },
  servers: [
    {
      url: "/",
      description: "현재 서버 루트"
    }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "구글 시트 동기화 인증용 토큰 (WBS_SYNC_SECRET 환경변수 값)"
      }
    }
  },
  paths: {
    "/api/wbs-sync": {
      post: {
        summary: "구글 시트 WBS 데이터 동기화",
        description: "구글 Apps Script로부터 동기화 요청을 수신하여 해당 프로젝트의 WBS 일정을 전체 동기화(교체) 적재합니다.",
        security: [
          { BearerAuth: [] }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["sheet_url", "rows"],
                properties: {
                  sheet_url: {
                    type: "string",
                    description: "동기화 요청을 보내는 구글 시트 URL",
                    example: "https://docs.google.com/spreadsheets/d/13A49_Y4h7UxTsJG35CW4vQnC1S4S0UgDqhGjWL176hY/edit"
                  },
                  rows: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["row_order", "level", "status", "plan_progress", "actual_progress"],
                      properties: {
                        row_order: { type: "integer", example: 1 },
                        level: { type: "integer", minimum: 1, maximum: 4, example: 1 },
                        task_l1: { type: "string", nullable: true, example: "착수" },
                        task_l2: { type: "string", nullable: true, example: null },
                        task_l3: { type: "string", nullable: true, example: null },
                        task_l4: { type: "string", nullable: true, example: null },
                        description: { type: "string", nullable: true, example: "WBS 일정 조율" },
                        assignee: { type: "string", nullable: true, example: "정인호" },
                        status: { type: "string", enum: ["미진행", "진행중", "완료"], example: "진행중" },
                        plan_start: { type: "string", format: "date", nullable: true, example: "2026-06-22" },
                        plan_end: { type: "string", format: "date", nullable: true, example: "2026-06-25" },
                        actual_start: { type: "string", format: "date", nullable: true, example: "2026-06-22" },
                        actual_end: { type: "string", format: "date", nullable: true, example: null },
                        plan_progress: { type: "integer", example: 50 },
                        actual_progress: { type: "integer", example: 30 }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "동기화 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "WBS 일정이 성공적으로 동기화되었습니다." }
                  }
                }
              }
            }
          },
          400: { description: "잘못된 요청 형식 또는 시트 URL 형식 오류" },
          401: { description: "인증 실패 (유효하지 않은 Bearer 토큰)" },
          404: { description: "등록되지 않은 시트 주소 (프로젝트 매핑 실패)" },
          500: { description: "서버 내부 환경변수 누락 또는 데이터베이스 작업 실패" }
        }
      }
    },
    "/api/a11y-sync": {
      post: {
        summary: "구글 시트 웹 접근성 점검표 동기화",
        description: "구글 Apps Script로부터 동기화된 웹 접근성 검수 대장 데이터 리스트를 수신하여 Supabase DB에 적재합니다.",
        security: [
          { BearerAuth: [] }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["sheet_url", "rows"],
                properties: {
                  sheet_url: {
                    type: "string",
                    example: "https://docs.google.com/spreadsheets/d/13A49_Y4h7UxTsJG35CW4vQnC1S4S0UgDqhGjWL176hY/edit"
                  },
                  rows: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["group_name", "text", "checked", "sort_order"],
                      properties: {
                        group_name: { type: "string", example: "메인 화면 > 헤더 영역" },
                        text: { type: "string", example: "1. 텍스트 콘텐츠의 명도 대비 (1.3.1)" },
                        checked: { type: "boolean", example: false },
                        assignee: { type: "string", nullable: true, example: "정인호" },
                        due_date: { type: "string", format: "date", nullable: true, example: "2026-06-30" },
                        memo: { type: "string", nullable: true, example: "{\"error_msg\":\"메인 배너 텍스트 명도비 부족\",\"check_status\":\"조치필요\",\"comment\":\"디자이너 검토 요망\"}" },
                        sort_order: { type: "integer", example: 10 },
                        tag: { type: "string", nullable: true, example: "조치필요" },
                        image_url: { type: "string", nullable: true, example: "https://example.com/uploads/image.png" }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "동기화 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "접근성 점검 항목이 성공적으로 동기화되었습니다." }
                  }
                }
              }
            }
          },
          400: { description: "잘못된 요청" },
          401: { description: "인증 실패" },
          404: { description: "연동된 프로젝트 찾을 수 없음" },
          500: { description: "서버 내부 데이터베이스 작업 오류" }
        }
      }
    },
    "/api/deploy-slide-sync": {
      post: {
        summary: "배포 슬라이드 생성 이력 등록",
        description: "자동화 실행으로 생성된 구글 프레젠테이션(슬라이드) 이력을 연동 데이터로 DB에 누적 등록합니다.",
        security: [
          { BearerAuth: [] }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["sheet_url", "slide_title", "slide_url"],
                properties: {
                  sheet_url: { type: "string", description: "동기화 구글 시트 URL", example: "https://docs.google.com/spreadsheets/d/13A49_Y4h7UxTsJG35CW4vQnC1S4S0UgDqhGjWL176hY/edit" },
                  slide_title: { type: "string", description: "생성된 슬라이드 명칭", example: "롯데잇츠 접근성 배포 슬라이드 - 2026-06-22" },
                  slide_url: { type: "string", description: "생성된 슬라이드 URL 주소", example: "https://docs.google.com/presentation/d/1234abcd..." }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "이력 등록 완료",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "배포 슬라이드가 성공적으로 등록되었습니다." },
                    project_id: { type: "string", example: "proj-uuid" },
                    slide_url: { type: "string", example: "https://docs.google.com/presentation/d/1234abcd..." }
                  }
                }
              }
            }
          },
          400: { description: "필수 값 누락 또는 구글 시트 URL 형식 비정상" },
          401: { description: "인증 실패 (유효하지 않은 Bearer 토큰)" },
          404: { description: "연동된 프로젝트 검색 실패" }
        }
      }
    },
    "/api/admin/users": {
      get: {
        summary: "전체 사용자 목록 조회 (관리자 전용)",
        description: "관리자(admin) 계정 권한이 탑재된 JWT 토큰(Authorization 헤더)을 기반으로 전체 가입 사용자 목록을 조회합니다.",
        responses: {
          200: {
            description: "사용자 목록 조회 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    users: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", example: "user-uuid" },
                          email: { type: "string", example: "user@example.com" },
                          created_at: { type: "string", format: "date-time" },
                          last_sign_in_at: { type: "string", format: "date-time" },
                          email_confirmed_at: { type: "string", format: "date-time" },
                          is_admin: { type: "boolean", example: false }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: "인증되지 않은 사용자" },
          403: { description: "어드민 권한 미보유 (Forbidden)" },
          500: { description: "서버 내부 오류" }
        }
      },
      patch: {
        summary: "사용자 관리자 권한 토글",
        description: "대상 사용자의 관리자(is_admin) 권한 여부를 활성화 혹은 해제 처리합니다. (본인의 어드민 권한 해제 시도는 차단됩니다.)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["userId", "is_admin"],
                properties: {
                  userId: { type: "string", description: "권한을 수정할 사용자 ID", example: "target-user-uuid" },
                  is_admin: { type: "boolean", description: "관리자 권한 부여 여부", example: true }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "권한 수정 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true }
                  }
                }
              }
            }
          },
          400: { description: "필드 미입력 또는 본인 관리자 해제 시도 차단" },
          401: { description: "인증 정보 없음" },
          403: { description: "어드민 권한 없음" },
          404: { description: "대상 사용자 찾을 수 없음" },
          500: { description: "서버 내부 오류" }
        }
      }
    }
  }
};
