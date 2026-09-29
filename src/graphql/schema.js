import { gql } from "graphql-tag";

export const typeDefs = gql`
  type Health {
    status: String!
  }

  type DeviceRegistration {
    id: ID!
    userId: ID!
    deviceId: String!
    platform: String!
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
    lastSeenAt: String!
  }

  type InAppNotification {
    id: ID!
    userId: ID!
    title: String!
    message: String!
    postId: ID
    isRead: Boolean!
    createdAt: String!
    readAt: String
  }

  type CategorySubscription {
    id: ID!
    userId: ID!
    categoryId: ID!
    createdAt: String!
  }

  input RegisterDeviceInput {
    deviceId: String!
    fcmToken: String!
    platform: String
  }

  input UnregisterDeviceInput {
    deviceId: String!
  }

  input SendTestNotificationInput {
    title: String!
    body: String!
    type: String
    targetId: String
  }

  type TestNotificationResult {
    successCount: Int!
    failureCount: Int!
    totalTokens: Int!
  }

  type Query {
    health: Health!

    userCategorySubscriptions: [CategorySubscription!]!

    notifications(limit: Int, offset: Int): [InAppNotification!]!

    unreadNotificationCount: Int!
  }

  type Mutation {
    registerDevice(input: RegisterDeviceInput!): DeviceRegistration!

    unregisterDevice(input: UnregisterDeviceInput!): DeviceRegistration!

    sendTestNotification(
      input: SendTestNotificationInput!
    ): TestNotificationResult!

    subscribeCategory(categoryId: ID!): Boolean!

    unsubscribeCategory(categoryId: ID!): Boolean!

    markNotificationRead(notificationId: ID!): Boolean!

    markAllNotificationsRead: Boolean!
  }
`;
