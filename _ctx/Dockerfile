FROM dc99012ad299 AS web
COPY --from=verkz-office-server:0.18.2 /web/assets/index-DrKLBe99.js /tmp/old.js
COPY --from=0ca07f0d1091 /src/src/main.rs /src/src/rec.rs /tmp/srv/
COPY ap.mjs apply.mjs delta.br main.rs.diff rec.rs.diff rs.md5 /tmp/
RUN node /tmp/ap.mjs /tmp/old.js /tmp/delta.br /tmp/index-kUwc1kA1.js && echo "6078d111c947a8056b2912b5714018ca6fea02c97839230cd4982933e1e37568  /tmp/index-kUwc1kA1.js" | sha256sum -c - && node /tmp/apply.mjs /tmp/srv/main.rs /tmp/main.rs.diff && node /tmp/apply.mjs /tmp/srv/rec.rs /tmp/rec.rs.diff && md5sum -c /tmp/rs.md5
FROM 0ca07f0d1091 AS build
WORKDIR /src
COPY --from=web /tmp/srv/main.rs /tmp/srv/rec.rs src/
RUN cargo build --release --offline
FROM verkz-office-server:0.18.2
COPY --from=build /src/target/release/verkz-office-server /usr/local/bin/verkz-office-server
COPY --from=web /tmp/index-kUwc1kA1.js /web/assets/index-kUwc1kA1.js
COPY index.html /web/index.html
COPY icons/ /web/icons/
