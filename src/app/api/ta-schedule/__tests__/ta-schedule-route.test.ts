import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/ta-schedule/[bookingId]/route";
import { GET as GET_METADATA } from "@/app/api/ta-schedule/metadata/route";
import { GET, POST } from "@/app/api/ta-schedule/route";

const COURSE_MATH = "11111111-1111-4111-8111-111111111111";
const COURSE_PHYS = "22222222-2222-4222-8222-222222222222";
const COHORT_A = "33333333-3333-4333-8333-333333333333";
const TA_ALI = "44444444-4444-4444-8444-444444444444";
const TA_MAI = "55555555-5555-4555-8555-555555555555";
const ROOM_104 = "66666666-6666-4666-8666-666666666666";
const ROOM_201 = "77777777-7777-4777-8777-777777777777";
const BOOKING_ID = "88888888-8888-4888-8888-888888888888";

const verifiedUser = {
  id: "user-123",
  is_anonymous: false,
  email: "youssef@university.edu",
  email_confirmed_at: "2026-11-26T00:05:00.000Z",
};

const mockGetUser = vi.fn();
const mockServerFrom = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockServerFrom,
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

function makeSelectChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    order: vi.fn(() => chain),
    returns: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
  };
  return chain;
}

describe("/api/ta-schedule route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CAMPUS_TZ = "UTC";
  });

  it("returns 401 UNAUTHORIZED across metadata, GET, POST, and PATCH when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const metaRes = await GET_METADATA();
    expect(metaRes.status).toBe(401);

    const getRes = await GET(
      new NextRequest("http://localhost:3000/api/ta-schedule")
    );
    expect(getRes.status).toBe(401);

    const postRes = await POST(
      new NextRequest("http://localhost:3000/api/ta-schedule", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(postRes.status).toBe(401);

    const patchRes = await PATCH(
      new NextRequest(`http://localhost:3000/api/ta-schedule/${BOOKING_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ bookingId: BOOKING_ID }) }
    );
    expect(patchRes.status).toBe(401);
  });

  it("GET /api/ta-schedule/metadata returns 200 with mapped courses, cohorts, TAs, and rooms", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    mockServerFrom.mockImplementation((table: string) => {
      switch (table) {
        case "courses":
          return makeSelectChain({
            data: [
              {
                id: COURSE_MATH,
                code: "MATH101",
                subject: "math",
                title: "Calculus I",
              },
            ],
            error: null,
          });
        case "cohorts":
          return makeSelectChain({
            data: [
              {
                id: COHORT_A,
                code: "Y1-STEM-A",
                label: "Year 1 STEM - Group A",
                student_count: 40,
              },
            ],
            error: null,
          });
        case "cohort_courses":
          return makeSelectChain({
            data: [{ cohort_id: COHORT_A, course_id: COURSE_MATH }],
            error: null,
          });
        case "tas":
          return makeSelectChain({
            data: [
              {
                id: TA_ALI,
                course_id: COURSE_MATH,
                display_name: "TA Ali",
                email: "ali@uni.edu",
              },
            ],
            error: null,
          });
        case "ta_rooms":
          return makeSelectChain({
            data: [
              {
                id: ROOM_104,
                code: "DISC-104",
                label: "Discussion Room 104",
                capacity: 45,
              },
            ],
            error: null,
          });
        default:
          return makeSelectChain({ data: [], error: null });
      }
    });

    const res = await GET_METADATA();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.cohorts[0].studentCount).toBe(40);
    expect(json.tas[0].displayName).toBe("TA Ali");
    expect(json.cohortCourses[0]).toEqual({
      cohortId: COHORT_A,
      courseId: COURSE_MATH,
    });
  });

  it("GET /api/ta-schedule rejects invalid weekStart and returns mapped bookings on valid request", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    const badRes = await GET(
      new NextRequest("http://localhost:3000/api/ta-schedule?weekStart=bad")
    );
    expect(badRes.status).toBe(400);

    mockServerFrom.mockReturnValue(
      makeSelectChain({
        data: [
          {
            id: BOOKING_ID,
            course_id: COURSE_MATH,
            cohort_id: COHORT_A,
            ta_id: TA_ALI,
            room_id: ROOM_104,
            topic: "Integration by Parts",
            status: "scheduled",
            starts_at: "2026-11-26T10:00:00.000Z",
            ends_at: "2026-11-26T11:00:00.000Z",
            courses: { code: "MATH101", subject: "math" },
            cohorts: { code: "Y1-STEM-A" },
            tas: { display_name: "TA Ali" },
            ta_rooms: { code: "DISC-104" },
          },
        ],
        error: null,
      })
    );

    const okRes = await GET(
      new NextRequest(
        `http://localhost:3000/api/ta-schedule?cohortId=${COHORT_A}&weekStart=2026-11-23`
      )
    );
    const json = await okRes.json();
    expect(okRes.status).toBe(200);
    expect(json.bookings).toHaveLength(1);
    expect(json.bookings[0]).toMatchObject({
      id: BOOKING_ID,
      courseCode: "MATH101",
      cohortCode: "Y1-STEM-A",
      taName: "TA Ali",
      roomCode: "DISC-104",
      subject: "math",
    });
  });

  it("POST /api/ta-schedule returns 400 VALIDATION_ERROR when TA does not teach course or cohort is not enrolled", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    // TA Mai teaches PHYS101, not MATH101 -> 400
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "courses") {
        return makeSelectChain({
          data: { id: COURSE_MATH, code: "MATH101" },
          error: null,
        });
      }
      if (table === "cohorts") {
        return makeSelectChain({ data: { id: COHORT_A }, error: null });
      }
      if (table === "tas") {
        return makeSelectChain({
          data: { id: TA_MAI, course_id: COURSE_PHYS },
          error: null,
        });
      }
      if (table === "ta_rooms") {
        return makeSelectChain({ data: { id: ROOM_104 }, error: null });
      }
      if (table === "cohort_courses") {
        return makeSelectChain({ data: { cohort_id: COHORT_A }, error: null });
      }
      return makeSelectChain({ data: null, error: null });
    });

    const mismatchTaRes = await POST(
      new NextRequest("http://localhost:3000/api/ta-schedule", {
        method: "POST",
        body: JSON.stringify({
          courseId: COURSE_MATH,
          cohortId: COHORT_A,
          taId: TA_MAI,
          roomId: ROOM_104,
          topic: "Derivatives",
          startsAt: "2026-11-26T14:00:00.000Z",
          endsAt: "2026-11-26T15:00:00.000Z",
        }),
        headers: { "Content-Type": "application/json" },
      })
    );

    const mismatchTaJson = await mismatchTaRes.json();
    expect(mismatchTaRes.status).toBe(400);
    expect(mismatchTaJson.error).toBe("VALIDATION_ERROR");

    // Cohort not enrolled in selected course -> 400
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "courses") {
        return makeSelectChain({
          data: { id: COURSE_MATH, code: "MATH101" },
          error: null,
        });
      }
      if (table === "cohorts") {
        return makeSelectChain({ data: { id: COHORT_A }, error: null });
      }
      if (table === "tas") {
        return makeSelectChain({
          data: { id: TA_ALI, course_id: COURSE_MATH },
          error: null,
        });
      }
      if (table === "ta_rooms") {
        return makeSelectChain({ data: { id: ROOM_104 }, error: null });
      }
      if (table === "cohort_courses") {
        return makeSelectChain({ data: null, error: null });
      }
      return makeSelectChain({ data: null, error: null });
    });

    const notEnrolledRes = await POST(
      new NextRequest("http://localhost:3000/api/ta-schedule", {
        method: "POST",
        body: JSON.stringify({
          courseId: COURSE_MATH,
          cohortId: COHORT_A,
          taId: TA_ALI,
          roomId: ROOM_104,
          topic: "Derivatives",
          startsAt: "2026-11-26T14:00:00.000Z",
          endsAt: "2026-11-26T15:00:00.000Z",
        }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(notEnrolledRes.status).toBe(400);
  });

  it("POST /api/ta-schedule returns 201 Created on valid booking and 409 BOOKING_CONFLICT on Postgres 23P01", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    const mockInsertSuccess = {
      id: BOOKING_ID,
      course_id: COURSE_MATH,
      cohort_id: COHORT_A,
      ta_id: TA_ALI,
      room_id: ROOM_104,
      topic: "Integration by Parts",
      status: "scheduled",
      starts_at: "2026-11-26T14:00:00.000Z",
      ends_at: "2026-11-26T15:00:00.000Z",
    };

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "courses") {
        return makeSelectChain({
          data: { id: COURSE_MATH, code: "MATH101" },
          error: null,
        });
      }
      if (table === "cohorts") {
        return makeSelectChain({ data: { id: COHORT_A }, error: null });
      }
      if (table === "tas") {
        return makeSelectChain({
          data: { id: TA_ALI, course_id: COURSE_MATH },
          error: null,
        });
      }
      if (table === "ta_rooms") {
        return makeSelectChain({ data: { id: ROOM_104 }, error: null });
      }
      if (table === "cohort_courses") {
        return makeSelectChain({ data: { cohort_id: COHORT_A }, error: null });
      }
      if (table === "profiles") {
        return { upsert: vi.fn(async () => ({ error: null })) };
      }
      if (table === "ta_bookings") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: mockInsertSuccess,
                error: null,
              })),
            })),
          })),
        };
      }
      return makeSelectChain({ data: null, error: null });
    });

    const createdRes = await POST(
      new NextRequest("http://localhost:3000/api/ta-schedule", {
        method: "POST",
        body: JSON.stringify({
          courseId: COURSE_MATH,
          cohortId: COHORT_A,
          taId: TA_ALI,
          roomId: ROOM_104,
          topic: "Integration by Parts",
          startsAt: "2026-11-26T14:00:00.000Z",
          endsAt: "2026-11-26T15:00:00.000Z",
        }),
        headers: { "Content-Type": "application/json" },
      })
    );
    const createdJson = await createdRes.json();
    expect(createdRes.status).toBe(201);
    expect(createdJson.booking.id).toBe(BOOKING_ID);

    // Simulate Postgres 23P01 exclusion_violation on overlapping PHYS101 booking for same cohort + room.
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "courses") {
        return makeSelectChain({
          data: { id: COURSE_PHYS, code: "PHYS101" },
          error: null,
        });
      }
      if (table === "cohorts") {
        return makeSelectChain({ data: { id: COHORT_A }, error: null });
      }
      if (table === "tas") {
        return makeSelectChain({
          data: { id: TA_MAI, course_id: COURSE_PHYS },
          error: null,
        });
      }
      if (table === "ta_rooms") {
        return {
          ...makeSelectChain({
            data: [
              {
                id: ROOM_104,
                code: "DISC-104",
                label: "Discussion Room 104",
                capacity: 45,
              },
              {
                id: ROOM_201,
                code: "LAB-B201",
                label: "STEM Studio B201",
                capacity: 45,
              },
            ],
            error: null,
          }),
          eq: vi.fn(() =>
            makeSelectChain({ data: { id: ROOM_104 }, error: null })
          ),
        };
      }
      if (table === "cohort_courses") {
        return makeSelectChain({ data: { cohort_id: COHORT_A }, error: null });
      }
      if (table === "profiles") {
        return { upsert: vi.fn(async () => ({ error: null })) };
      }
      if (table === "ta_bookings") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: null,
                error: { code: "23P01", message: "excl_ta_booking_cohort_overlap" },
              })),
            })),
          })),
          select: vi.fn(() =>
            makeSelectChain({
              data: [
                {
                  id: BOOKING_ID,
                  course_id: COURSE_MATH,
                  cohort_id: COHORT_A,
                  ta_id: TA_ALI,
                  room_id: ROOM_104,
                  topic: "Integration by Parts",
                  status: "scheduled",
                  starts_at: "2026-11-26T14:00:00.000Z",
                  ends_at: "2026-11-26T15:00:00.000Z",
                  courses: { code: "MATH101", subject: "math" },
                  cohorts: { code: "Y1-STEM-A" },
                  tas: { display_name: "TA Ali" },
                  ta_rooms: { code: "DISC-104" },
                },
              ],
              error: null,
            })
          ),
        };
      }
      return makeSelectChain({ data: null, error: null });
    });

    const conflictRes = await POST(
      new NextRequest("http://localhost:3000/api/ta-schedule", {
        method: "POST",
        body: JSON.stringify({
          courseId: COURSE_PHYS,
          cohortId: COHORT_A,
          taId: TA_MAI,
          roomId: ROOM_104,
          topic: "Free-Body Diagrams",
          startsAt: "2026-11-26T14:30:00.000Z",
          endsAt: "2026-11-26T15:30:00.000Z",
        }),
        headers: { "Content-Type": "application/json" },
      })
    );

    const conflictJson = await conflictRes.json();
    expect(conflictRes.status).toBe(409);
    expect(conflictJson.error).toBe("BOOKING_CONFLICT");
    expect(conflictJson.conflicts.map((c: { dimension: string }) => c.dimension)).toEqual([
      "cohort",
      "room",
    ]);
    expect(conflictJson.suggestions).toHaveLength(3);
    expect(conflictJson.suggestions[0]).toEqual({
      startsAt: "2026-11-26T15:00:00.000Z",
      endsAt: "2026-11-26T16:00:00.000Z",
      roomId: ROOM_104,
      roomCode: "DISC-104",
    });
  });

  it("PATCH /api/ta-schedule/[bookingId] cancels a booking and returns 404 when missing", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    mockAdminFrom.mockReturnValue({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { id: BOOKING_ID, status: "cancelled" },
              error: null,
            })),
          })),
        })),
      })),
    });

    const okRes = await PATCH(
      new NextRequest(`http://localhost:3000/api/ta-schedule/${BOOKING_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ bookingId: BOOKING_ID }) }
    );
    const okJson = await okRes.json();
    expect(okRes.status).toBe(200);
    expect(okJson).toEqual({
      booking: { id: BOOKING_ID, status: "cancelled" },
    });

    mockAdminFrom.mockReturnValue({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: null,
              error: null,
            })),
          })),
        })),
      })),
    });

    const missingRes = await PATCH(
      new NextRequest(`http://localhost:3000/api/ta-schedule/${BOOKING_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ bookingId: BOOKING_ID }) }
    );
    expect(missingRes.status).toBe(404);
  });
});
