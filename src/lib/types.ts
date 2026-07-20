export type OrganizationRole = "owner" | "admin" | "instructor";

export type School = {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  default_price: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Instructor = {
  id: string;
  name: string;
  slug: string;
  public_name: string | null;
  timezone: string;
  is_active?: boolean;
};

export type InstructorProfile = Instructor & {
  photo_url: string | null;
  short_bio: string | null;
  contact_text: string | null;
  car_description: string | null;
  experience_text: string | null;
  public_is_visible: boolean;
  profile_updated_at: string | null;
};

export type LessonType = {
  id: string;
  code?: string;
  name: string;
  color: string;
  kind?: "driving" | "theory";
  description?: string | null;
  default_duration_minutes: number;
  default_price_amount?: number | null;
  tags?: string[];
  sort_order?: number;
  is_active?: boolean;
  requires_vehicle?: boolean;
};

export type SchoolLessonTypePrice = {
  id: string;
  organization_id: string;
  school_id: string;
  lesson_type_id: string;
  price_amount: number;
  created_at: string;
  updated_at: string;
};

export type ScheduleDay = {
  id: string;
  instructor_id: string;
  date: string;
  transmission: "automatic" | "manual" | null;
  published_at?: string | null;
  slot_count?: number;
};

export type Slot = {
  id: string;
  instructor_id: string;
  schedule_day_id: string;
  lesson_type_id: string;
  school_id: string | null;
  start_time: string;
  end_time: string;
  location_type: "in_car" | "online" | "classroom" | "other";
  status: "available" | "blocked" | "cancelled";
  note: string | null;
};

export type LessonState = "scheduled" | "completed" | "no_show";

export type Booking = {
  id: string;
  slot_id: string;
  student_label: string;
  created_at: string;
  price_amount?: number | null;
  paid_amount?: number | null;
  is_paid: boolean;
  paid_at: string | null;
  payment_note?: string | null;
  lesson_state: LessonState;
  completed_at: string | null;
  instructor_note: string | null;
  student_access_id?: string | null;
};

export type LessonReview = {
  id: string;
  organization_id: string;
  instructor_id: string;
  booking_id: string;
  student_access_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export type StudentAccess = {
  id: string;
  instructor_id: string;
  display_label: string;
  student_phone: string | null;
  login: string;
  total_lesson_limit: number | null;
  weekly_lesson_limit: number | null;
  is_active: boolean;
  school_id: string | null;
  is_archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  lesson_type_ids: string[];
};

export type StudentRegistrationRequestStatus =
  | "pending"
  | "approved"
  | "rejected";

export type StudentRegistrationRequest = {
  id: string;
  organization_id: string;
  instructor_id: string;
  first_name: string | null;
  last_name: string | null;
  student_phone: string | null;
  school_text: string | null;
  login: string;
  status: StudentRegistrationRequestStatus;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StaffInvitationStatus =
  | "invited"
  | "submitted"
  | "approved"
  | "rejected"
  | "expired";

export type StaffInvitation = {
  id: string;
  organization_id: string;
  invited_by_member_id: string | null;
  token: string;
  status: StaffInvitationStatus;
  invited_name: string | null;
  invited_email: string | null;
  invited_phone: string | null;
  submitted_name: string | null;
  submitted_email: string | null;
  submitted_phone: string | null;
  user_id: string | null;
  instructor_id: string | null;
  expires_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InstructorSetting = {
  instructor_id: string;
  booking_access_code: string | null;
  booking_access_code_updated_at: string | null;
  student_registration_token: string;
  student_registration_enabled: boolean;
  student_registration_token_updated_at: string;
};

export type OrganizationSiteSettings = {
  organization_id: string;
  hero_label: string;
  hero_title: string;
  hero_text: string;
  about_title: string;
  about_text: string;
  contact_phone: string | null;
  telegram_url: string | null;
  whatsapp_url: string | null;
  landing_content: unknown;
  show_about: boolean;
  show_lesson_types: boolean;
  show_instructors: boolean;
  show_contacts: boolean;
  show_student_login: boolean;
  updated_at: string;
};

export type InstructorSiteSettings = {
  instructor_id: string;
  organization_id: string;
  is_visible: boolean;
  show_photo: boolean;
  show_bio: boolean;
  show_contact: boolean;
  show_car: boolean;
  show_experience: boolean;
  public_note: string | null;
  public_contact: string | null;
  sort_order: number;
  updated_at: string;
};

export type AccessCodeHistoryItem = {
  id: string;
  instructor_id: string;
  access_code: string;
  created_at: string;
};
