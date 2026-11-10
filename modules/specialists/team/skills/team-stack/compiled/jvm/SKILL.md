---
name: team-stack-compiled-jvm
description: "Java and Kotlin transaction and test evidence for the assigned JVM component."
when: "The assigned component runs on the JVM, including Java or Kotlin."
not-when: "A JVM dependency exists only in an unrelated project."
---

# JVM

Identify the actual component, JDK, framework, build configuration and test source set; Gradle or Maven metadata is a clue, not evidence a test ran. Versions and project configuration govern: do not assume the behavior of an unrelated framework or a newer release.

- In Spring's default proxy mode, only calls entering through the proxy are intercepted. Self-invocation of an annotated method does not itself start the annotated transaction; inspect the actual transaction configuration, caller and existing outer transaction before reporting a broken boundary. AspectJ mode differs. Source: https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html
- For Gradle, distinguish a test task, its compiled test classes and its runtime classpath; filters, dry runs and missing test detection can leave the behavior unexecuted. Source: https://docs.gradle.org/current/userguide/java_testing.html
- For Maven, inspect the effective test configuration and results: Surefire can skip execution or compilation. A successful build with skipped tests is not test evidence. Source: https://maven.apache.org/surefire/maven-surefire-plugin/examples/skipping-tests.html

No-build evidence is limited to inspected source/configuration and supplied reports. Gradle or Maven test execution requires a host-supported build lane, actual dependencies and an authorized project command; a wrapper or report filename alone proves none of these. If unavailable, mark not-run. Do not install or fetch a JDK, plugins or dependencies in review.
