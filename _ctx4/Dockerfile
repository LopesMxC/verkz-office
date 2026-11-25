FROM 0ca07f0d1091 AS build
WORKDIR /src
COPY srv/main.rs srv/rec.rs srv/default_layout.json src/
RUN cargo build --release --offline
FROM verkz-office-server:0.18.5
COPY --from=build /src/target/release/verkz-office-server /usr/local/bin/verkz-office-server
COPY assets/ /web/assets/
COPY index.html /web/index.html
