-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('SAAS', 'SERVICE', 'TRAINING', 'RECRUITMENT', 'LICENSE', 'ADS', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('LIVE', 'BETA', 'PLANNED');

-- CreateEnum
CREATE TYPE "StageKind" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "RecordObject" AS ENUM ('COMPANY', 'PERSON', 'DEAL');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'URL', 'SELECT', 'MULTI_SELECT', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "ViewType" AS ENUM ('TABLE', 'KANBAN');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('PHONE', 'EMAIL', 'LINKEDIN', 'SOCIAL', 'INBOUND', 'REFERRAL', 'EVENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'EMAIL', 'LINKEDIN', 'MEETING', 'SOCIAL', 'SMS', 'OTHER');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "ActivitySource" AS ENUM ('MANUAL', 'GMAIL', 'CALENDAR', 'LINKEDIN_EXTENSION', 'MCP', 'IMPORT');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('FROM', 'TO', 'CC', 'BCC', 'ORGANIZER', 'ATTENDEE');

-- CreateEnum
CREATE TYPE "Actor" AS ENUM ('USER', 'MCP', 'SYNC', 'IMPORT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('ACCOUNTANT', 'MSP', 'LAWYER', 'INSURER', 'CONSULTANT', 'INVESTOR', 'OTHER');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_client" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT,
    "clientDiscoveryId" TEXT,
    "disabled" BOOLEAN DEFAULT false,
    "skipConsent" BOOLEAN,
    "enableEndSession" BOOLEAN,
    "subjectType" TEXT,
    "scopes" TEXT[],
    "clientCredentialsScopes" TEXT[],
    "userId" TEXT,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "name" TEXT,
    "uri" TEXT,
    "icon" TEXT,
    "contacts" TEXT[],
    "tos" TEXT,
    "policy" TEXT,
    "softwareId" TEXT,
    "softwareVersion" TEXT,
    "softwareStatement" TEXT,
    "redirectUris" TEXT[],
    "postLogoutRedirectUris" TEXT[],
    "backchannelLogoutUri" TEXT,
    "backchannelLogoutSessionRequired" BOOLEAN,
    "tokenEndpointAuthMethod" TEXT,
    "applicationType" TEXT,
    "jwks" TEXT,
    "jwksUri" TEXT,
    "grantTypes" TEXT[],
    "responseTypes" TEXT[],
    "requirePKCE" BOOLEAN,
    "dpopBoundAccessTokens" BOOLEAN DEFAULT false,
    "referenceId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "oauth_client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_resource" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessTokenTtl" INTEGER,
    "refreshTokenTtl" INTEGER,
    "signingAlgorithm" TEXT,
    "signingKeyId" TEXT,
    "allowedScopes" TEXT[],
    "customClaims" JSONB,
    "dpopBoundAccessTokensRequired" BOOLEAN DEFAULT false,
    "disabled" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "policyVersion" INTEGER DEFAULT 1,
    "metadata" JSONB,

    CONSTRAINT "oauth_resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_client_resource" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3),

    CONSTRAINT "oauth_client_resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_refresh_token" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT NOT NULL,
    "referenceId" TEXT,
    "authorizationCodeId" TEXT,
    "resources" TEXT[],
    "requestedUserInfoClaims" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3),
    "revoked" TIMESTAMP(3),
    "rotatedAt" TIMESTAMP(3),
    "rotationReplayResponse" TEXT,
    "rotationReplayExpiresAt" TIMESTAMP(3),
    "authTime" TIMESTAMP(3),
    "confirmation" JSONB,
    "scopes" TEXT[],

    CONSTRAINT "oauth_refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_access_token" (
    "id" TEXT NOT NULL,
    "token" TEXT,
    "clientId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT,
    "referenceId" TEXT,
    "authorizationCodeId" TEXT,
    "resources" TEXT[],
    "requestedUserInfoClaims" TEXT[],
    "refreshId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3),
    "revoked" TIMESTAMP(3),
    "confirmation" JSONB,
    "scopes" TEXT[],

    CONSTRAINT "oauth_access_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_consent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT,
    "referenceId" TEXT,
    "resources" TEXT[],
    "requestedUserInfoClaims" TEXT[],
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "oauth_consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_client_assertion" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_client_assertion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jwks" (
    "id" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "alg" TEXT,
    "crv" TEXT,

    CONSTRAINT "jwks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("workspaceId","userId")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "email" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "name" TEXT NOT NULL,
    "siren" TEXT,
    "vatNumber" TEXT,
    "email" TEXT,
    "website" TEXT,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "name" TEXT NOT NULL,
    "entityId" TEXT,
    "tagline" TEXT,
    "url" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "projectId" TEXT,
    "kind" "ProductKind" NOT NULL DEFAULT 'OTHER',
    "status" "ProductStatus" NOT NULL DEFAULT 'LIVE',
    "tagline" TEXT,
    "buyer" TEXT,
    "pricing" TEXT,
    "url" TEXT,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "name" TEXT NOT NULL,
    "kind" "StageKind" NOT NULL DEFAULT 'OPEN',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "object" "RecordObject" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "FieldType" NOT NULL,
    "options" JSONB,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "View" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "object" "RecordObject" NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ViewType" NOT NULL DEFAULT 'TABLE',
    "filters" JSONB NOT NULL DEFAULT '[]',
    "sorts" JSONB NOT NULL DEFAULT '[]',
    "columns" JSONB NOT NULL DEFAULT '[]',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "View_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "linkedinUrl" TEXT,
    "industry" TEXT,
    "size" TEXT,
    "city" TEXT,
    "country" TEXT,
    "description" TEXT,
    "priority" TEXT,
    "source" "Channel",
    "custom" JSONB NOT NULL DEFAULT '{}',
    "createdBy" "Actor" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "emails" TEXT[],
    "phones" TEXT[],
    "jobTitle" TEXT,
    "linkedinUrl" TEXT,
    "city" TEXT,
    "companyId" TEXT,
    "source" "Channel",
    "consentAt" TIMESTAMP(3),
    "consentSource" TEXT,
    "custom" JSONB NOT NULL DEFAULT '{}',
    "createdBy" "Actor" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "name" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "companyId" TEXT,
    "contactId" TEXT,
    "amount" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "probability" INTEGER,
    "closeDate" DATE,
    "source" "Channel",
    "lostReason" TEXT,
    "commissionPaidAt" TIMESTAMP(3),
    "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "custom" JSONB NOT NULL DEFAULT '{}',
    "createdBy" "Actor" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "partnerId" TEXT,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "type" "ActivityType" NOT NULL,
    "direction" "Direction",
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "subject" TEXT,
    "body" TEXT,
    "outcome" TEXT,
    "source" "ActivitySource" NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT,
    "threadId" TEXT,
    "url" TEXT,
    "manuallyLinked" BOOLEAN NOT NULL DEFAULT false,
    "companyId" TEXT,
    "dealId" TEXT,
    "createdBy" "Actor" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityParticipant" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "activityId" TEXT NOT NULL,
    "personId" TEXT,
    "handle" TEXT,
    "displayName" TEXT,
    "role" "ParticipantRole" NOT NULL DEFAULT 'TO',

    CONSTRAINT "ActivityParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "title" TEXT NOT NULL,
    "body" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "companyId" TEXT,
    "personId" TEXT,
    "dealId" TEXT,
    "createdBy" "Actor" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "title" TEXT,
    "body" TEXT NOT NULL,
    "companyId" TEXT,
    "personId" TEXT,
    "dealId" TEXT,
    "createdBy" "Actor" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "name" TEXT NOT NULL,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "actor" "Actor" NOT NULL DEFAULT 'USER',
    "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT,
    "personId" TEXT,
    "dealId" TEXT,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mailbox" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[],
    "syncContacts" BOOLEAN NOT NULL DEFAULT true,
    "calendarSyncToken" TEXT,
    "calendarSyncedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "historyId" TEXT,
    "authFailedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "productId" TEXT,
    "createTask" BOOLEAN NOT NULL DEFAULT true,
    "leadCount" INTEGER NOT NULL DEFAULT 0,
    "lastLeadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "name" TEXT NOT NULL,
    "type" "PartnerType" NOT NULL DEFAULT 'OTHER',
    "status" "PartnerStatus" NOT NULL DEFAULT 'PROSPECT',
    "companyId" TEXT,
    "contactId" TEXT,
    "commissionPct" INTEGER NOT NULL DEFAULT 10,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "rateLimit_key_key" ON "rateLimit"("key");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_client_clientId_key" ON "oauth_client"("clientId");

-- CreateIndex
CREATE INDEX "oauth_client_userId_idx" ON "oauth_client"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_resource_identifier_key" ON "oauth_resource"("identifier");

-- CreateIndex
CREATE INDEX "oauth_client_resource_resourceId_idx" ON "oauth_client_resource"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_client_resource_clientId_resourceId_key" ON "oauth_client_resource"("clientId", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_refresh_token_token_key" ON "oauth_refresh_token"("token");

-- CreateIndex
CREATE INDEX "oauth_refresh_token_clientId_idx" ON "oauth_refresh_token"("clientId");

-- CreateIndex
CREATE INDEX "oauth_refresh_token_sessionId_idx" ON "oauth_refresh_token"("sessionId");

-- CreateIndex
CREATE INDEX "oauth_refresh_token_userId_idx" ON "oauth_refresh_token"("userId");

-- CreateIndex
CREATE INDEX "oauth_refresh_token_authorizationCodeId_idx" ON "oauth_refresh_token"("authorizationCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_access_token_token_key" ON "oauth_access_token"("token");

-- CreateIndex
CREATE INDEX "oauth_access_token_clientId_idx" ON "oauth_access_token"("clientId");

-- CreateIndex
CREATE INDEX "oauth_access_token_sessionId_idx" ON "oauth_access_token"("sessionId");

-- CreateIndex
CREATE INDEX "oauth_access_token_userId_idx" ON "oauth_access_token"("userId");

-- CreateIndex
CREATE INDEX "oauth_access_token_authorizationCodeId_idx" ON "oauth_access_token"("authorizationCodeId");

-- CreateIndex
CREATE INDEX "oauth_access_token_refreshId_idx" ON "oauth_access_token"("refreshId");

-- CreateIndex
CREATE INDEX "oauth_consent_clientId_idx" ON "oauth_consent"("clientId");

-- CreateIndex
CREATE INDEX "oauth_consent_userId_idx" ON "oauth_consent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Member_userId_idx" ON "Member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_workspaceId_idx" ON "Invitation"("workspaceId");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_workspaceId_name_key" ON "Entity"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Project_workspaceId_name_key" ON "Project"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "Product_workspaceId_idx" ON "Product"("workspaceId");

-- CreateIndex
CREATE INDEX "Stage_workspaceId_idx" ON "Stage"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomField_workspaceId_object_key_key" ON "CustomField"("workspaceId", "object", "key");

-- CreateIndex
CREATE INDEX "View_workspaceId_idx" ON "View"("workspaceId");

-- CreateIndex
CREATE INDEX "Company_name_idx" ON "Company"("name");

-- CreateIndex
CREATE INDEX "Company_deletedAt_idx" ON "Company"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Company_workspaceId_domain_key" ON "Company"("workspaceId", "domain");

-- CreateIndex
CREATE INDEX "Person_companyId_idx" ON "Person"("companyId");

-- CreateIndex
CREATE INDEX "Person_emails_idx" ON "Person" USING GIN ("emails");

-- CreateIndex
CREATE INDEX "Person_lastName_firstName_idx" ON "Person"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Person_deletedAt_idx" ON "Person"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Person_workspaceId_linkedinUrl_key" ON "Person"("workspaceId", "linkedinUrl");

-- CreateIndex
CREATE INDEX "Deal_productId_stageId_position_idx" ON "Deal"("productId", "stageId", "position");

-- CreateIndex
CREATE INDEX "Deal_companyId_idx" ON "Deal"("companyId");

-- CreateIndex
CREATE INDEX "Deal_deletedAt_idx" ON "Deal"("deletedAt");

-- CreateIndex
CREATE INDEX "Deal_workspaceId_idx" ON "Deal"("workspaceId");

-- CreateIndex
CREATE INDEX "Activity_companyId_occurredAt_idx" ON "Activity"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "Activity_dealId_occurredAt_idx" ON "Activity"("dealId", "occurredAt");

-- CreateIndex
CREATE INDEX "Activity_threadId_idx" ON "Activity"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_workspaceId_source_externalId_key" ON "Activity"("workspaceId", "source", "externalId");

-- CreateIndex
CREATE INDEX "ActivityParticipant_activityId_idx" ON "ActivityParticipant"("activityId");

-- CreateIndex
CREATE INDEX "ActivityParticipant_personId_idx" ON "ActivityParticipant"("personId");

-- CreateIndex
CREATE INDEX "ActivityParticipant_handle_idx" ON "ActivityParticipant"("handle");

-- CreateIndex
CREATE INDEX "ActivityParticipant_workspaceId_idx" ON "ActivityParticipant"("workspaceId");

-- CreateIndex
CREATE INDEX "Task_completedAt_dueAt_idx" ON "Task"("completedAt", "dueAt");

-- CreateIndex
CREATE INDEX "Task_dealId_idx" ON "Task"("dealId");

-- CreateIndex
CREATE INDEX "Task_personId_idx" ON "Task"("personId");

-- CreateIndex
CREATE INDEX "Task_companyId_idx" ON "Task"("companyId");

-- CreateIndex
CREATE INDEX "Task_workspaceId_idx" ON "Task"("workspaceId");

-- CreateIndex
CREATE INDEX "Note_companyId_idx" ON "Note"("companyId");

-- CreateIndex
CREATE INDEX "Note_personId_idx" ON "Note"("personId");

-- CreateIndex
CREATE INDEX "Note_dealId_idx" ON "Note"("dealId");

-- CreateIndex
CREATE INDEX "Note_workspaceId_idx" ON "Note"("workspaceId");

-- CreateIndex
CREATE INDEX "TimelineEvent_companyId_happenedAt_idx" ON "TimelineEvent"("companyId", "happenedAt");

-- CreateIndex
CREATE INDEX "TimelineEvent_personId_happenedAt_idx" ON "TimelineEvent"("personId", "happenedAt");

-- CreateIndex
CREATE INDEX "TimelineEvent_dealId_happenedAt_idx" ON "TimelineEvent"("dealId", "happenedAt");

-- CreateIndex
CREATE INDEX "TimelineEvent_workspaceId_idx" ON "TimelineEvent"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Mailbox_workspaceId_email_key" ON "Mailbox"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "LeadSource_keyHash_key" ON "LeadSource"("keyHash");

-- CreateIndex
CREATE INDEX "LeadSource_workspaceId_idx" ON "LeadSource"("workspaceId");

-- CreateIndex
CREATE INDEX "Partner_workspaceId_idx" ON "Partner"("workspaceId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_client" ADD CONSTRAINT "oauth_client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_client_resource" ADD CONSTRAINT "oauth_client_resource_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_client"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_client_resource" ADD CONSTRAINT "oauth_client_resource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "oauth_resource"("identifier") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_client"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_client"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_refreshId_fkey" FOREIGN KEY ("refreshId") REFERENCES "oauth_refresh_token"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_client"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "View" ADD CONSTRAINT "View_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityParticipant" ADD CONSTRAINT "ActivityParticipant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityParticipant" ADD CONSTRAINT "ActivityParticipant_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityParticipant" ADD CONSTRAINT "ActivityParticipant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mailbox" ADD CONSTRAINT "Mailbox_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSource" ADD CONSTRAINT "LeadSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSource" ADD CONSTRAINT "LeadSource_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Tenant isolation
--
-- A workspace's data is read and written as soldlyne_app, a role that can't bypass row-level
-- security, with the workspace set per transaction (see lib/prisma.ts). Every table below is FORCED:
-- its owner gets no rows either unless a policy names it, so forgetting the role finds nothing.
--
-- A foreign key's check bypasses row-level security, so on its own it would let a row point at another
-- workspace's. Each policy's WITH CHECK therefore looks every parent up, through that parent's policy.
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'soldlyne_app') THEN
    CREATE ROLE soldlyne_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

-- Whoever runs this migration is who the app connects as: it has to be allowed to SET ROLE.
GRANT soldlyne_app TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO soldlyne_app;

-- Inviting an address again replaces its open invitation: one open per address and workspace.
CREATE UNIQUE INDEX "Invitation_workspaceId_email_open_key" ON "Invitation"("workspaceId", "email") WHERE "acceptedAt" IS NULL;

ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Invitation" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Invitation" TO soldlyne_app;

ALTER TABLE "Entity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Entity" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Entity" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Entity" TO soldlyne_app;

ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Project" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true)
    AND ("entityId" IS NULL OR EXISTS (SELECT 1 FROM "Entity" parent WHERE parent."id" = "Project"."entityId")));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Project" TO soldlyne_app;

ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Product" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true)
    AND ("projectId" IS NULL OR EXISTS (SELECT 1 FROM "Project" parent WHERE parent."id" = "Product"."projectId")));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Product" TO soldlyne_app;

ALTER TABLE "Stage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Stage" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Stage" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Stage" TO soldlyne_app;

ALTER TABLE "CustomField" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomField" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "CustomField" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "CustomField" TO soldlyne_app;

ALTER TABLE "View" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "View" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "View" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "View" TO soldlyne_app;

ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Company" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Company" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Company" TO soldlyne_app;

ALTER TABLE "Person" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Person" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Person" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true)
    AND ("companyId" IS NULL OR EXISTS (SELECT 1 FROM "Company" parent WHERE parent."id" = "Person"."companyId")));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Person" TO soldlyne_app;

ALTER TABLE "Deal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Deal" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Deal" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true)
    AND EXISTS (SELECT 1 FROM "Product" parent WHERE parent."id" = "Deal"."productId")
    AND EXISTS (SELECT 1 FROM "Stage" parent WHERE parent."id" = "Deal"."stageId")
    AND ("companyId" IS NULL OR EXISTS (SELECT 1 FROM "Company" parent WHERE parent."id" = "Deal"."companyId"))
    AND ("contactId" IS NULL OR EXISTS (SELECT 1 FROM "Person" parent WHERE parent."id" = "Deal"."contactId"))
    AND ("partnerId" IS NULL OR EXISTS (SELECT 1 FROM "Partner" parent WHERE parent."id" = "Deal"."partnerId")));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Deal" TO soldlyne_app;

ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Activity" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Activity" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true)
    AND ("companyId" IS NULL OR EXISTS (SELECT 1 FROM "Company" parent WHERE parent."id" = "Activity"."companyId"))
    AND ("dealId" IS NULL OR EXISTS (SELECT 1 FROM "Deal" parent WHERE parent."id" = "Activity"."dealId")));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Activity" TO soldlyne_app;

ALTER TABLE "ActivityParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivityParticipant" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "ActivityParticipant" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true)
    AND EXISTS (SELECT 1 FROM "Activity" parent WHERE parent."id" = "ActivityParticipant"."activityId")
    AND ("personId" IS NULL OR EXISTS (SELECT 1 FROM "Person" parent WHERE parent."id" = "ActivityParticipant"."personId")));
GRANT SELECT, INSERT, UPDATE, DELETE ON "ActivityParticipant" TO soldlyne_app;

ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Task" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true)
    AND ("companyId" IS NULL OR EXISTS (SELECT 1 FROM "Company" parent WHERE parent."id" = "Task"."companyId"))
    AND ("personId" IS NULL OR EXISTS (SELECT 1 FROM "Person" parent WHERE parent."id" = "Task"."personId"))
    AND ("dealId" IS NULL OR EXISTS (SELECT 1 FROM "Deal" parent WHERE parent."id" = "Task"."dealId")));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Task" TO soldlyne_app;

ALTER TABLE "Note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Note" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Note" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true)
    AND ("companyId" IS NULL OR EXISTS (SELECT 1 FROM "Company" parent WHERE parent."id" = "Note"."companyId"))
    AND ("personId" IS NULL OR EXISTS (SELECT 1 FROM "Person" parent WHERE parent."id" = "Note"."personId"))
    AND ("dealId" IS NULL OR EXISTS (SELECT 1 FROM "Deal" parent WHERE parent."id" = "Note"."dealId")));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Note" TO soldlyne_app;

ALTER TABLE "TimelineEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TimelineEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "TimelineEvent" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true)
    AND ("companyId" IS NULL OR EXISTS (SELECT 1 FROM "Company" parent WHERE parent."id" = "TimelineEvent"."companyId"))
    AND ("personId" IS NULL OR EXISTS (SELECT 1 FROM "Person" parent WHERE parent."id" = "TimelineEvent"."personId"))
    AND ("dealId" IS NULL OR EXISTS (SELECT 1 FROM "Deal" parent WHERE parent."id" = "TimelineEvent"."dealId")));
GRANT SELECT, INSERT, UPDATE, DELETE ON "TimelineEvent" TO soldlyne_app;

ALTER TABLE "Mailbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Mailbox" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Mailbox" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Mailbox" TO soldlyne_app;

ALTER TABLE "LeadSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeadSource" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "LeadSource" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true)
    AND ("productId" IS NULL OR EXISTS (SELECT 1 FROM "Product" parent WHERE parent."id" = "LeadSource"."productId")));
GRANT SELECT, INSERT, UPDATE, DELETE ON "LeadSource" TO soldlyne_app;

ALTER TABLE "Partner" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Partner" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Partner" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true)
    AND ("companyId" IS NULL OR EXISTS (SELECT 1 FROM "Company" parent WHERE parent."id" = "Partner"."companyId"))
    AND ("contactId" IS NULL OR EXISTS (SELECT 1 FROM "Person" parent WHERE parent."id" = "Partner"."contactId")));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Partner" TO soldlyne_app;

-- The two tables the trusted path reads before it knows the workspace: a lead's key and an
-- invitation's link say which one it is. Invitations are also accepted there, in one transaction
-- with the membership they create.
CREATE POLICY "trusted_lookup" ON "LeadSource" FOR SELECT TO CURRENT_USER USING (true);
CREATE POLICY "trusted_path" ON "Invitation" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

