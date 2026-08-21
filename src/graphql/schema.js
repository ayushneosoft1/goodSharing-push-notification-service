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

  input RegisterDeviceInput {
    deviceId: String!
    fcmToken: String!
    platform: String
  }

  input UnregisterDeviceInput {
    deviceId: String!
  }

  type Query {
    health: Health!
  }

  type Mutation {
    registerDevice(input: RegisterDeviceInput!): DeviceRegistration!
    unregisterDevice(input: UnregisterDeviceInput!): DeviceRegistration!
  }
`;
